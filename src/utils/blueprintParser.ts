import { z } from 'zod';
import type { Blueprint } from '@/lib/blueprintSchema';
import { blueprintSchema } from '@/lib/blueprintSchema';

// Raw LLM JSON shape before normalization
export const llmRawSchema = z.object({
  pages: z.array(z.object({
    route: z.string().optional(),
    name: z.string().optional(),
    title: z.string().optional(),
    content: z.string(),
  })).default([]),
  components: z.array(z.object({
    name: z.string(),
    content: z.string(),
  })).default([]),
  apiRoutes: z.array(z.object({
    route: z.string().optional(),
    name: z.string().optional(),
    content: z.string(),
    method: z.string().optional(),
  })).default([]),
  schema: z.string().optional().default(''),
  meta: z.object({
    plan: z.array(z.string()).optional(),
  }).optional()
});

function kebab(str: string) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'page';
}
function pascal(str: string) {
  return (str.replace(/[^A-Za-z0-9]+/g, ' ') as string)
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join('') || 'Component';
}
function validIdentifier(id: string) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(id); }

function normalizePages(raw: any[]): any[] {
  return raw.map(p => {
    const title = p.title || p.name || 'Page';
    const base = p.route || p.name || title;
    let route = base.startsWith('/') ? base : `/${kebab(base)}`;
    if (route === '//') route = '/';
    if (!route.startsWith('/')) route = '/' + route;
    if (route === '/index') route = '/';
    return { route, title, content: p.content || '' };
  }).filter(p => p.content.trim().length > 0);
}
function normalizeComponents(raw: any[]): any[] {
  return raw.map(c => {
    let name = pascal(c.name || 'Component');
    if (!validIdentifier(name)) name = 'Component';
    let code = c.content || '';
    if (!new RegExp(`(export\\s+(const|function|class)\\s+${name})`).test(code)) {
      if (/^\s*function\s+/.test(code) || /^\s*class\s+/.test(code)) {
        code = `export ${code}`;
      } else if (!code.includes('return')) {
        code = `export const ${name} = () => (<div>${name}</div>);`;
      } else if (!code.startsWith('export')) {
        code = `export const ${name} = () => {${code}}`;
      }
    }
    return { name, content: code };
  }).filter(c => c.content.trim().length > 0);
}
function normalizeApis(raw: any[]): any[] {
  return raw.map(r => {
    const base = r.route || r.name || '/api/endpoint';
    let route = base.startsWith('/') ? base : `/${base}`;
    if (!route.startsWith('/api/')) route = route.replace(/^\/+/, '/api/');
    return {
      route,
      method: ['GET','POST','PUT','DELETE'].includes((r.method||'').toUpperCase()) ? r.method.toUpperCase() : 'GET',
      content: r.content || ''
    };
  }).filter(r => r.content.trim().length > 0);
}

function tryParseJSON(text: string) { try { return JSON.parse(text); } catch { return null; } }

export function extractBalancedObject(text: string): string | null {
  let start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0; let inStr: string | null = null; let prev = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
    } else {
      if (ch === '"' || ch === '\'') inStr = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    prev = ch;
  }
  return null;
}

export function salvageJson(raw: string) {
  let cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  let parsed = tryParseJSON(cleaned);
  if (parsed) return parsed;
  const balanced = extractBalancedObject(cleaned);
  if (balanced) { const p = tryParseJSON(balanced); if (p) return p; }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const window = cleaned.slice(first, last + 1);
    parsed = tryParseJSON(window);
    if (parsed) return parsed;
    const singleFixed = window
      .replace(/(['"])??([A-Za-z0-9_]+)\1??\s*:/g, '"$2":')
      .replace(/'([^']*)'/g, (m, g1) => (g1.includes('"') ? m : '"' + g1 + '"'));
    parsed = tryParseJSON(singleFixed);
    if (parsed) return parsed;
  }
  const braceLines = cleaned.split(/\n/).filter(l => /[{}\[\]":]/.test(l));
  const possible = braceLines.join('\n');
  parsed = tryParseJSON(possible);
  if (parsed) return parsed;
  throw new Error('Invalid JSON: model output not parseable');
}

export function transformRawToBlueprint(raw: z.infer<typeof llmRawSchema>, prompt: string): Blueprint {
  const pages = normalizePages(raw.pages);
  const components = normalizeComponents(raw.components);
  const apiRoutes = normalizeApis(raw.apiRoutes);
  const componentNames = components.map(c => c.name);
  const enhancedPages = pages.map(p => {
    let code = p.content;
    if (!/export\s+default/.test(code)) {
      if (/<[A-Za-z]/.test(code)) {
        code = `export default function Page(){\n  return (\n${code}\n  );\n}`;
      } else {
        code = `export default function Page(){ return <div>${p.title}</div>; }`;
      }
    }
    for (const name of componentNames) {
      if (code.includes(name) && !new RegExp(`import\\s+.*${name}`).test(code)) {
        code = `import { ${name} } from '../components';\n` + code;
      }
    }
    return { route: p.route, title: p.title, components: componentNames.filter(n => code.includes(n)), code };
  });
  const blueprintDraft: Blueprint = {
  version: 1,
    name: `Generated ${pascal(prompt.split(/[\.!?\n]/)[0].slice(0,40))}`,
    description: 'Auto-generated from prompt',
    pages: enhancedPages.length ? enhancedPages : [{ route: '/', title: 'Home', components: [], code: 'export default function Page(){return <div>Home</div>;}' }],
    components: components.map(c => ({ name: c.name, code: c.content, props: {} })),
    apiRoutes: apiRoutes.map(a => ({ route: a.route, method: a.method as any, code: a.content })),
    prismaModels: raw.schema ? [{ name: 'ExtraSchema', definition: raw.schema }] : [],
  };
  return blueprintSchema.parse(blueprintDraft);
}
