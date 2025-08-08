import { env } from '@/lib/env';

export interface StructurePlan {
  pages: { route: string; title?: string }[];
  components: { name: string; purpose?: string }[];
  apiRoutes: { route: string; method?: 'GET'|'POST'|'PUT'|'DELETE'; purpose?: string }[];
  prismaModels: { name: string; purpose?: string }[];
}

async function callGeminiJSON(prompt: string, model?: string, apiKey?: string): Promise<any> {
  const key = apiKey || env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key missing');
  const m = model || env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini plan request failed');
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join('\n') || '';
  return text;
}

async function callOllama(prompt: string, model?: string): Promise<string> {
  const baseUrl = env.OLLAMA_BASE_URL;
  const m = model || env.OLLAMA_MODEL;
  const body:any = { model: m, prompt, stream:false, options:{ temperature:0.1, top_p:0.9, num_predict:1024 } };
  const res = await fetch(`${baseUrl}/api/generate`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Ollama plan request failed');
  const data = await res.json();
  return data.response || '';
}

function safeParseStructure(raw: string, userPrompt: string): StructurePlan {
  // Attempt to extract JSON
  const match = raw.match(/\{[\s\S]*\}$/); // last json-like
  let jsonText = match ? match[0] : raw;
  try { const parsed = JSON.parse(jsonText); return normalizeStructure(parsed); } catch {}
  // fallback simple heuristic
  return { pages:[{ route:'/', title:'Home' }], components:[], apiRoutes:[], prismaModels:[] };
}

function normalizeStructure(obj: any): StructurePlan {
  const plan: StructurePlan = { pages:[], components:[], apiRoutes:[], prismaModels:[] };
  if (Array.isArray(obj.pages)) plan.pages = obj.pages.filter((p: any)=>p?.route).map((p: any)=>({ route:String(p.route), title:p.title?String(p.title):undefined }));
  if (Array.isArray(obj.components)) plan.components = obj.components.filter((c: any)=>c?.name).map((c: any)=>({ name:String(c.name), purpose:c.purpose?String(c.purpose):undefined }));
  if (Array.isArray(obj.apiRoutes)) plan.apiRoutes = obj.apiRoutes.filter((r: any)=>r?.route).map((r: any)=>({ route:String(r.route), method:(['GET','POST','PUT','DELETE'].includes(r.method)?r.method:'GET') as any, purpose:r.purpose?String(r.purpose):undefined }));
  if (Array.isArray(obj.prismaModels)) plan.prismaModels = obj.prismaModels.filter((m: any)=>m?.name).map((m: any)=>({ name:String(m.name), purpose:m.purpose?String(m.purpose):undefined }));
  if (!plan.pages.length) plan.pages.push({ route:'/', title:'Home'});
  return plan;
}

export async function generateStructurePlan(userPrompt: string, provider: 'gemini'|'ollama', params?: any): Promise<StructurePlan> {
  const instruction = `You are a senior Next.js architect. Produce ONLY JSON with keys pages[], components[], apiRoutes[], prismaModels[]. No code. Each entry short.\nUser Prompt: ${userPrompt}`;
  let raw='';
  if (provider==='gemini') raw = await callGeminiJSON(instruction, params?.model, params?.geminiKey);
  else raw = await callOllama(`${instruction}\nRespond JSON only:`, params?.model);
  return safeParseStructure(raw, userPrompt);
}

export interface ArtifactSpec { kind: 'page'|'component'|'api'|'model'; name?: string; route?: string; method?: string; }

export async function generateArtifactCode(spec: ArtifactSpec, userPrompt: string, plan: StructurePlan, provider: 'gemini'|'ollama', params?: any): Promise<string> {
  const context = `Project intent: ${userPrompt}\nPlan summary: pages=${plan.pages.length}, components=${plan.components.length}, apiRoutes=${plan.apiRoutes.length}, models=${plan.prismaModels.length}`;
  let artifactDesc='';
  if (spec.kind==='page') artifactDesc = `Generate a Next.js App Router page component for route "${spec.route}".`;
  else if (spec.kind==='component') artifactDesc = `Generate a reusable React component named ${spec.name}.`;
  else if (spec.kind==='api') artifactDesc = `Generate a Next.js route handler (TypeScript) for API route ${spec.route} (${spec.method||'GET'}).`;
  else if (spec.kind==='model') artifactDesc = `Generate a Prisma model named ${spec.name}.`;
  const constraints = `Rules: Output ONLY raw code for pages/components/api, no JSON, no markdown fences. For prisma model output only the model definition line(s). Keep concise but functional.`;
  const fullPrompt = `${context}\n${artifactDesc}\n${constraints}`;
  if (provider==='gemini') {
    const text = await callGeminiJSON(fullPrompt, params?.model, params?.geminiKey);
    return text.trim();
  } else {
    const text = await callOllama(fullPrompt, params?.model);
    return text.trim();
  }
}
