import fs from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/prisma';
import type { OpParsedTags } from './opTags';

interface ApplyOptions { projectId: string; baseDir?: string; }
interface ApplyResult { writes: { path: string; bytes: number }[]; renames: { from: string; to: string }[]; deletes: { path: string; ok: boolean }[]; dependencies: string[]; updatedBlueprint?: any; }

async function ensureDir(filePath: string) { await fs.mkdir(path.dirname(filePath), { recursive: true }); }

function deriveRouteFromPagePath(rel: string): string {
  let p = rel.replace(/^pages\//,'');
  p = p.replace(/\.(jsx|tsx|js|ts)$/,'');
  if (p === 'index') return '/';
  return '/' + p.replace(/index$/,'').replace(/\\/g,'/');
}

export async function applyOpActions(tags: OpParsedTags, opts: ApplyOptions): Promise<ApplyResult> {
  const base = opts.baseDir || path.join(process.cwd(), 'generated', opts.projectId);
  const writes: { path: string; bytes: number }[] = [];
  const renames: { from: string; to: string }[] = [];
  const deletes: { path: string; ok: boolean }[] = [];
  const MAX_FILE_BYTES = 150_000; // 150 KB safety cap per op-write

  function sanitize(rel: string): string | null {
    if (!rel) return null;
    if (rel.startsWith('/') || rel.includes('..')) return null; // deny absolute / traversal
    return rel.replace(/\\/g,'/').replace(/\/+/, '/');
  }

  const project = await prisma.project.findFirst({ where: { id: opts.projectId } });
  let blueprint: any = null;
  if (project) { try { blueprint = JSON.parse(project.blueprint); } catch { blueprint = null; } }
  if (!blueprint) blueprint = { name:'Session', pages:[], components:[], apiRoutes:[], prismaModels:[] };

  for (const w of tags.writes) {
    const safe = sanitize(w.path);
    if (!safe) continue;
    const bytes = Buffer.byteLength(w.content, 'utf8');
    if (bytes > MAX_FILE_BYTES) continue; // skip oversized write
    const abs = path.join(base, safe);
    await ensureDir(abs);
    await fs.writeFile(abs, w.content, 'utf8');
    writes.push({ path: safe, bytes });
    if (safe.startsWith('pages/')) {
      const route = deriveRouteFromPagePath(w.path);
      const existing = blueprint.pages.find((p: any) => p.route === route);
      if (existing) existing.content = w.content; else blueprint.pages.push({ route, title: route === '/' ? 'Home' : route.slice(1), content: w.content });
    } else if (safe.startsWith('components/')) {
      const name = path.basename(safe).replace(/\.(tsx|jsx|ts|js)$/,'');
      const existing = blueprint.components.find((c: any) => c.name === name);
      if (existing) existing.content = w.content; else blueprint.components.push({ name, content: w.content });
    } else if (safe.startsWith('api/')) {
      const apiRoute = '/api/' + safe.replace(/^api\//,'').replace(/\.(ts|js)$/,'');
      const existing = blueprint.apiRoutes.find((r: any) => r.route === apiRoute);
      if (existing) existing.content = w.content; else blueprint.apiRoutes.push({ route: apiRoute, method:'GET', content: w.content });
    }
  }

  for (const r of tags.renames) {
    const fromSafe = sanitize(r.from); const toSafe = sanitize(r.to);
    if (!fromSafe || !toSafe) continue;
    const fromAbs = path.join(base, fromSafe); const toAbs = path.join(base, toSafe);
    try { await ensureDir(toAbs); await fs.rename(fromAbs, toAbs); renames.push({ from: fromSafe, to: toSafe }); } catch { /* ignore */ }
  }

  for (const d of tags.deletes) {
    const safe = sanitize(d.path); if (!safe) continue;
    const abs = path.join(base, safe);
    try { await fs.unlink(abs); deletes.push({ path: safe, ok: true }); } catch { deletes.push({ path: safe, ok: false }); }
  }

  if (tags.dependencies.length) {
    const pkgPath = path.join(process.cwd(), 'package.json');
    try {
      const raw = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw); pkg.dependencies = pkg.dependencies || {};
      for (const dep of tags.dependencies) { if (!pkg.dependencies[dep]) pkg.dependencies[dep] = '*'; }
      await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2)+'\n','utf8');
    } catch { /* ignore */ }
  }

  try { await prisma.project.update({ where: { id: opts.projectId }, data: { blueprint: JSON.stringify(blueprint) } }); } catch { /* ignore */ }

  return { writes, renames, deletes, dependencies: tags.dependencies, updatedBlueprint: blueprint };
}
