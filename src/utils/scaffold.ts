import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';
import type { Blueprint } from '../lib/blueprintSchema';

const GENERATED_ROOT = path.join(process.cwd(), 'generated');

async function ensureDir(dir: string) { await fs.mkdir(dir, { recursive: true }); }

// File-system safe (kebab-ish)
function fileSafe(segment: string) {
  return segment
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'item';
}
// TypeScript identifier (PascalCase)
function idSafe(name: string) {
  const parts = name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const core = parts.map(p => p[0].toUpperCase() + p.slice(1)).join('');
  const ident = core.replace(/^[^A-Za-z_]/, 'X');
  return ident || 'Component';
}

const pageTemplate = Handlebars.compile(`import React from 'react';\n{{#if hasComponents}}import { {{componentsList}} } from '{{componentsImportPath}}';{{/if}}\nexport default function {{componentName}}(){\n  return (\n    <div>\n      <h1>{{title}}</h1>\n      {/* Generated content placeholder */}\n    </div>\n  );\n}`);

const componentTemplate = Handlebars.compile(`import React from 'react';\nexport const {{identifier}}: React.FC = () => {\n  return (<div>{{identifier}} component</div>);\n};`);

const apiTemplate = Handlebars.compile(`import { NextResponse } from 'next/server';\nexport async function GET(){\n  return NextResponse.json({ ok: true, route: '{{route}}' });\n}`);

export interface GeneratedFileRecord { type: 'page' | 'component' | 'api' | 'prisma' | 'barrel'; relativePath: string; }

export interface FileContentStreamer {
  start?: (rec: GeneratedFileRecord, size: number) => void;
  chunk?: (rec: GeneratedFileRecord, chunk: string) => void;
  end?: (rec: GeneratedFileRecord) => void;
}

// Added optional includePaths (array of relative paths) to restrict which files are (re)written
// Added optional contentStreamer for real-time file content streaming
export async function writeGeneratedProject(projectId: string, blueprint: Blueprint, onFile?: (rec: GeneratedFileRecord) => void, includePaths?: string[], contentStreamer?: FileContentStreamer): Promise<GeneratedFileRecord[]> {
  const includeSet = includePaths && includePaths.length ? new Set(includePaths) : null;
  const created: GeneratedFileRecord[] = [];
  const notify = (rec: GeneratedFileRecord) => { created.push(rec); if (onFile) try { onFile(rec); } catch { /* ignore */ } };
  const streamStart = (rec: GeneratedFileRecord, code: string) => { try { contentStreamer?.start?.(rec, code.length); } catch {} };
  const streamChunks = (rec: GeneratedFileRecord, code: string) => {
    if (!contentStreamer?.chunk) return;
    const size = 800; // chunk size characters
    for (let i=0;i<code.length;i+=size) {
      const slice = code.slice(i, i+size);
      try { contentStreamer.chunk(rec, slice); } catch {}
    }
  };
  const streamEnd = (rec: GeneratedFileRecord) => { try { contentStreamer?.end?.(rec); } catch {} };

  const base = path.join(GENERATED_ROOT, projectId);
  await ensureDir(base);
  const pagesDir = path.join(base, 'pages');
  const componentsDir = path.join(base, 'components');
  const apiDir = path.join(base, 'api');
  await Promise.all([ensureDir(pagesDir), ensureDir(componentsDir), ensureDir(apiDir)]);

  // Components + collect barrel exports
  const barrelLines: string[] = [];
  const componentIdents: string[] = [];
  for (const comp of blueprint.components) {
    const ident = idSafe(comp.name || 'Component');
    const fileBase = fileSafe(comp.name || ident);
    const code = comp.code?.trim() ? comp.code : componentTemplate({ identifier: ident });
    const rel = path.join('components', `${fileBase}.tsx`);
    if (includeSet && !includeSet.has(rel)) continue; // skip if not selected
    const rec: GeneratedFileRecord = { type: 'component', relativePath: rel };
    streamStart(rec, code); streamChunks(rec, code);
    await fs.writeFile(path.join(base, rel), code, 'utf8');
    streamEnd(rec);
    barrelLines.push(`export * from './${fileBase}';`);
    componentIdents.push(ident);
    notify(rec);
  }
  if (barrelLines.length) {
    const barrelRel = path.join('components', 'index.ts');
    if (!includeSet || includeSet.has(barrelRel)) {
      const code = barrelLines.join('\n') + '\n';
      const rec: GeneratedFileRecord = { type: 'barrel', relativePath: barrelRel };
      streamStart(rec, code); streamChunks(rec, code);
      await fs.writeFile(path.join(base, barrelRel), code, 'utf8');
      streamEnd(rec);
      notify(rec);
    }
  }

  // Pages (nested)
  for (const page of blueprint.pages) {
    const rawRoute = page.route || '/';
    const trimmed = rawRoute.trim() === '' ? '/' : rawRoute.trim();
    let routePath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
    if (routePath === '') routePath = 'index';
    const segments = routePath.split('/').filter(Boolean).map(fileSafe);
    let fileName: string;
    if (segments.length === 0) fileName = 'index.tsx';
    else if (segments.length === 1) fileName = segments[0] === 'index' ? 'index.tsx' : `${segments[0]}.tsx`;
    else fileName = `${segments.pop()}.tsx`;
    const dirSegments = segments;
    const relDir = path.join('pages', ...dirSegments);
    await ensureDir(path.join(base, relDir));
    const rel = path.join(relDir, fileName);
    if (includeSet && !includeSet.has(rel)) continue;
    const depth = dirSegments.length; // pages/<segments...>
    const componentsImportPath = '../'.repeat(depth + 1) + 'components';
    const code = page.code?.trim() ? page.code : pageTemplate({
      componentName: idSafe(page.title || 'Page'),
      title: page.title || 'Generated Page',
      hasComponents: componentIdents.length > 0,
      componentsList: componentIdents.join(', '),
      componentsImportPath,
    });
    const rec: GeneratedFileRecord = { type: 'page', relativePath: rel };
    streamStart(rec, code); streamChunks(rec, code);
    await fs.writeFile(path.join(base, rel), code, 'utf8');
    streamEnd(rec);
    notify(rec);
  }

  // API routes
  for (const api of blueprint.apiRoutes) {
    let raw = api.route || '';
    raw = raw.replace(/^\/+/,'').replace(/^api\/+/,'')
    if (raw === '') raw = 'index';
    const segments = raw.split('/').filter(Boolean).map(fileSafe);
    const file = `${segments.pop()}.ts`;
    const relDir = path.join('api', ...segments);
    await ensureDir(path.join(base, relDir));
    const rel = path.join(relDir, file);
    if (includeSet && !includeSet.has(rel)) continue;
    const code = api.code?.trim() ? api.code : apiTemplate({ route: api.route });
    const rec: GeneratedFileRecord = { type: 'api', relativePath: rel };
    streamStart(rec, code); streamChunks(rec, code);
    await fs.writeFile(path.join(base, rel), code, 'utf8');
    streamEnd(rec);
    notify(rec);
  }

  // Prisma models
  if (blueprint.prismaModels?.length) {
    const rel = 'models.prisma';
    if (!includeSet || includeSet.has(rel)) {
      const prismaOut = blueprint.prismaModels.map(m => m.definition).join('\n\n');
      const rec: GeneratedFileRecord = { type: 'prisma', relativePath: rel };
      streamStart(rec, prismaOut); streamChunks(rec, prismaOut);
      await fs.writeFile(path.join(base, rel), prismaOut, 'utf8');
      streamEnd(rec);
      notify(rec);
    }
  }
  return created;
}

Handlebars.registerHelper('upper', (str: string) => str.toUpperCase());
