import type { Blueprint } from '../lib/blueprintSchema';
import { blueprintSchema } from '../lib/blueprintSchema';
import { z } from 'zod';
import { env } from '@/lib/env';

// Strengthened raw schema (closer to final) including route & title
const llmRawSchema = z.object({
  pages: z.array(z.object({
    route: z.string().optional(), // model may supply or we derive
    name: z.string().optional(),  // fallback for title
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
    // force index mapping
    if (route === '/index') route = '/';
    return {
      route,
      title,
      content: p.content || '',
    };
  }).filter(p => p.content.trim().length > 0);
}
function normalizeComponents(raw: any[]): any[] {
  return raw.map(c => {
    let name = pascal(c.name || 'Component');
    if (!validIdentifier(name)) name = 'Component';
    let code = c.content || '';
    // Ensure export of identifier
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

function tryParseJSON(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

function salvageJson(raw: string) {
  // Remove markdown fences
  let cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  // Quick direct attempt
  let parsed = tryParseJSON(cleaned);
  if (parsed) return parsed;
  // Extract first '{' to last '}' window
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const window = cleaned.slice(first, last + 1);
    parsed = tryParseJSON(window);
    if (parsed) return parsed;
    // Heuristic fixes: replace single quotes around keys/strings (naive)
    const singleFixed = window
      .replace(/(['\"])?([A-Za-z0-9_]+)\1\s*:/g, '"$2":')
      .replace(/'([^']*)'/g, (m, g1) => (g1.includes('"') ? m : '"' + g1 + '"'));
    parsed = tryParseJSON(singleFixed);
    if (parsed) return parsed;
  }
  // Attempt to collect JSON object lines only
  const braceLines = cleaned.split(/\n/).filter(l => /[{}\[\]\":]/.test(l));
  const possible = braceLines.join('\n');
  parsed = tryParseJSON(possible);
  if (parsed) return parsed;
  throw new Error('Invalid JSON: model output not parseable');
}

function transformRawToBlueprint(raw: z.infer<typeof llmRawSchema>, prompt: string): Blueprint {
  const pages = normalizePages(raw.pages);
  const components = normalizeComponents(raw.components);
  const apiRoutes = normalizeApis(raw.apiRoutes);
  // Inject component imports if missing
  const componentNames = components.map(c => c.name);
  const enhancedPages = pages.map(p => {
    let code = p.content;
    if (!/export\s+default/.test(code)) {
      // Wrap simple JSX into a default component if needed
      if (/<[A-Za-z]/.test(code)) {
        code = `export default function Page(){\n  return (\n${code}\n  );\n}`;
      } else {
        code = `export default function Page(){ return <div>${p.title}</div>; }`;
      }
    }
    // Prepend imports for components if references exist but no import
    for (const name of componentNames) {
      if (code.includes(name) && !new RegExp(`import\\s+.*${name}`).test(code)) {
        code = `import { ${name} } from '../components';\n` + code;
      }
    }
    return {
      route: p.route,
      title: p.title,
      components: componentNames.filter(n => code.includes(n)),
      code,
    };
  });

  const blueprintDraft: Blueprint = {
    name: `Generated ${pascal(prompt.split(/[\.!?\n]/)[0].slice(0,40))}`,
    description: 'Auto-generated from prompt',
    pages: enhancedPages.length ? enhancedPages : [{ route: '/', title: 'Home', components: [], code: 'export default function Page(){return <div>Home</div>;}' }],
    components: components.map(c => ({ name: c.name, code: c.content, props: {} })),
    apiRoutes: apiRoutes.map(a => ({ route: a.route, method: a.method as any, code: a.content })),
    prismaModels: raw.schema ? [{ name: 'ExtraSchema', definition: raw.schema }] : [],
  };
  return blueprintSchema.parse(blueprintDraft);
}

export async function generateBlueprint(prompt: string): Promise<Blueprint> {
  const baseUrl = env.OLLAMA_BASE_URL;
  const model = env.OLLAMA_MODEL;

  const system = `You are a deterministic code generator. OUTPUT ONLY RAW JSON (no markdown, no backticks). Schema:
{\n  "pages": { "route"?: string; "title"?: string; "name"?: string; "content": string; }[],\n  "components": { "name": string; "content": string; }[],\n  "apiRoutes": { "route"?: string; "name"?: string; "method"?: "GET"|"POST"|"PUT"|"DELETE"; "content": string; }[],\n  "schema": string\n}\nRules:\n- component.name must be PascalCase, no spaces, match ^[A-Za-z][A-Za-z0-9]*$.\n- page routes must start with '/' (use '/' for homepage). If route omitted derive from title.\n- content fields must contain COMPLETE, minimal working TypeScript/React or Next.js route handler code.\n- NO commentary. NO markdown fences. JSON ONLY.`;

  const body = {
    model,
    prompt: `${system}\nUser Prompt: ${prompt}\nReturn JSON now:`,
    stream: false,
    options: { temperature: 0.1, top_p: 0.9 },
  } as any;

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error('Ollama request failed');
  }
  const data = await res.json();
  const rawText = data.response || data; // Ollama style

  let rawJson: any;
  try {
    rawJson = salvageJson(rawText);
  } catch (err: any) {
    const snippet = rawText.slice(0, 400).replace(/\s+/g,' ').trim();
    throw new Error(`Invalid JSON: model output not parseable (snippet: ${snippet})`);
  }
  const parsedRaw = llmRawSchema.safeParse(rawJson);
  if (!parsedRaw.success) {
    throw new Error('Schema mismatch: model JSON shape invalid');
  }
  return transformRawToBlueprint(parsedRaw.data, prompt);
}
