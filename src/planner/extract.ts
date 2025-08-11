import { PlanV2, PlanV2Schema, emptyPlan } from './planV2';
import { env } from '@/lib/env';

interface LLMParams { temperature?: number; top_p?: number; max_tokens?: number; geminiKey?: string; model?: string }

async function callProvider(prompt:string, provider:'ollama'|'gemini', params:LLMParams): Promise<string> {
  if (provider==='ollama') {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ model: env.OLLAMA_MODEL, prompt, stream:false, options:{ temperature: params.temperature ?? 0.1, top_p: params.top_p ?? 0.9, num_predict: params.max_tokens ?? 2048 } }) });
    if (!res.ok) throw new Error('ollama failed');
    const data = await res.json();
    return data.response || '';
  } else {
    const key = params.geminiKey || env.GEMINI_API_KEY;
    if (!key) throw new Error('gemini key missing');
    const model = params.model || env.GEMINI_MODEL || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const body = { contents:[{ parts:[{ text: prompt }] }] };
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('gemini failed');
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('') || ''; return text;
  }
}

function extractJson<T>(raw:string, fallback:T): T {
  const match = raw.match(/\{[\s\S]*\}$/);
  if (!match) return fallback;
  try { return JSON.parse(match[0]); } catch { return fallback; }
}

// Added optional onSection callback for incremental streaming
export async function generatePlanV2(
  userPrompt:string,
  provider:'ollama'|'gemini',
  params:LLMParams,
  onSection?: (info:{ section:string; ms:number; data:any })=>void
): Promise<PlanV2> {
  const sections: Partial<PlanV2> = {};
  const timed = async <T>(section:string, fn:()=>Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const data = await fn();
    const ms = Date.now()-t0;
    try { onSection && onSection({ section, ms, data }); } catch {}
    return data;
  };

  // 1. meta + high level summary
  const metaJson = await timed('meta', async () => {
    const raw = await callProvider(`Summarize the app succinctly and list stack (always include Next.js, React, Prisma). Return JSON { summary:string, stack:string[] }\nPrompt: ${userPrompt}`, provider, params);
    return extractJson(raw, { summary:'', stack:['Next.js','React','Prisma'] });
  });
  sections.meta = { appName: undefined, summary: metaJson.summary, stack: Array.isArray(metaJson.stack)? metaJson.stack: ['Next.js','React','Prisma'] } as any;

  // 2-5. Parallel fetch core structural sections: entities, roles, features, routes
  const [entJson, rolesJson, featJson, routesJson] = await Promise.all([
    timed('entities', async () => {
      const raw = await callProvider(`Extract domain entities with fields and relations. JSON { entities:[{ name, fields:[{name,type,optional?,description?}], relations:[{target,type,field?,inverse?,description?}] }] }\nPrompt:${userPrompt}`, provider, params);
      return extractJson(raw, { entities:[] });
    }),
    timed('roles', async () => {
      const raw = await callProvider(`Identify user roles (if any) and permissions. JSON { roles:[{name, description?, permissions:string[]}] }\nPrompt:${userPrompt}`, provider, params);
      return extractJson(raw, { roles:[] });
    }),
    timed('features', async () => {
      const raw = await callProvider(`List core features. JSON { features:[{id,title,description?,entities:string[],actions:[{verb,target?,description?}]}] }\nPrompt:${userPrompt}`, provider, params);
      return extractJson(raw, { features:[] });
    }),
    timed('routes', async () => {
      const raw = await callProvider(`Propose Next.js app routes (pages and api). JSON { routes:[{path,type:\"page\"|\"api\",auth?,description?,featureIds:string[],dynamicParams:string[]}] }\nPrompt:${userPrompt}`, provider, params);
      return extractJson(raw, { routes:[] });
    })
  ]);
  sections.entities = Array.isArray(entJson.entities)? entJson.entities: [] as any;
  sections.roles = Array.isArray(rolesJson.roles)? rolesJson.roles: [] as any;
  sections.features = Array.isArray(featJson.features)? featJson.features: [] as any;
  sections.routes = Array.isArray(routesJson.routes)? routesJson.routes: [] as any;

  // 6-8. Parallel secondary sections that depend on prior results: components (independent), apiContracts (needs routes), prismaModels (needs entities)
  const [compsJson, apiContractsJson, modelJson] = await Promise.all([
    timed('components', async () => {
      const raw = await callProvider(`List key React components. JSON { components:[{name,kind?:\"layout\"|\"page\"|\"ui\"|\"feature\",routePath?,featureId?,purpose?,dependsOn:string[]}] }\nPrompt:${userPrompt}`, provider, params);
      return extractJson(raw, { components:[] });
    }),
    timed('apiContracts', async () => {
      const apiRoutes = (sections.routes||[]).filter(r=>r.type==='api');
      const apiPrompt = `For these api routes: ${apiRoutes.map(r=>r.path).join(', ')||'(none)'} define contracts. JSON { apis:[{route,method,name?,description?,request:{query:[{name,type?}],bodyFields:[{name,type?,required?}]},response:{fields:[{name,type?}]}}] }`;
      const raw = await callProvider(apiPrompt, provider, params);
      return extractJson(raw, { apis:[] });
    }),
    timed('prismaModels', async () => {
      const raw = await callProvider(`Convert entities into Prisma schema models. JSON { models:[{ name, definition, fromEntity }] }\nEntities:${JSON.stringify(sections.entities).slice(0,4000)}`, provider, params);
      return extractJson(raw, { models:[] });
    })
  ]);
  sections.components = Array.isArray(compsJson.components)? compsJson.components: [] as any;
  sections.apiContracts = Array.isArray(apiContractsJson.apis)? apiContractsJson.apis: [] as any;
  sections.prismaModels = Array.isArray(modelJson.models)? modelJson.models: [] as any;

  // 9. dependencies (simple heuristic) after components resolved
  await timed('dependencies', async () => {
    const deps: any[] = [];
    (sections.components||[]).forEach(c=>{
      (c.dependsOn||[]).forEach((d:string)=> deps.push({ from:c.name, to:d, reason:'component-dep'}));
      if (c.featureId) deps.push({ from:c.name, to:c.featureId, reason:'component-feature'});
    });
    sections.dependencies = deps as any; return deps;
  });

  // Build full plan
  const merged: any = { ...emptyPlan(), ...sections };
  const parsed = PlanV2Schema.safeParse(merged);
  if (!parsed.success) {
    const warnPlan = { ...emptyPlan(), warnings:[`planV2 schema errors: ${parsed.error.issues.length}`] };
    try { onSection && onSection({ section:'final', ms:0, data: warnPlan }); } catch {}
    return warnPlan;
  }

  if (parsed.data.entities.length === 0) parsed.data.warnings.push('No entities detected');
  try { onSection && onSection({ section:'final', ms:0, data: parsed.data }); } catch {}
  return parsed.data;
}
