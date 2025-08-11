import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { writeGeneratedProject } from '@/utils/scaffold';
import { checkRate } from '@/utils/rateLimiter';
import { validateCsrf } from '@/utils/csrf';
import { generateBlueprintUnified } from '@/utils/llm';
import { salvageJson, llmRawSchema, transformRawToBlueprint } from '@/utils/blueprintParser';
import { env } from '@/lib/env';
import { generatePlanV2 } from '@/planner/extract';

export const runtime = 'nodejs';

function streamify(cb: (push:(event:string, data:any)=>void) => Promise<void>) {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const push = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try { await cb(push); push('done',{}); } catch (e:any) { push('error',{ message: e?.message || 'Generation failed' }); } finally { controller.close(); }
    }
  });
  return new Response(readable, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive' } });
}

function replaceBacktickContent(raw: string): string {
  return raw.replace(/"content"\s*:\s*`([\s\S]*?)`/g, (_m, inner) => {
    const jsonStr = JSON.stringify(inner);
    return `"content": ${jsonStr}`;
  }).replace(/`{3,}[\s\S]*?`{3,}/g, m => m.replace(/`/g,''));
}

async function streamOllamaRaw(prompt: string, params: any, onToken: (t:string)=>void): Promise<string> {
  const baseUrl = env.OLLAMA_BASE_URL;
  const model = env.OLLAMA_MODEL;
  const system = `ROLE: Autonomous Next.js code generation agent.\nYou silently ANALYZE -> PLAN -> OUTPUT.\nYou must output ONLY VALID JSON (no backticks, no markdown, no commentary).\nSCHEMA: { "pages": { "route"?: string; "title"?: string; "name"?: string; "content": string; }[], "components": { "name": string; "content": string; }[], "apiRoutes": { "route"?: string; "name"?: string; "method"?: "GET"|"POST"|"PUT"|"DELETE"; "content": string; }[], "schema": string, "meta"?: { "plan"?: string[] }, "prismaModels"?: { "name": string; "definition": string; }[] }\nCONSTRAINTS:\n- Every array key present; empty array if none.\n- No empty content fields.\n- Prefer functional React components (App Router).\nOUTPUT: JSON ONLY.`;
  const primaryPrompt = `${system}\nUser Prompt: ${prompt}\nReturn JSON now:`;
  const body: any = { model, prompt: primaryPrompt, stream: true, options: { temperature: params?.temperature ?? 0.1, top_p: params?.top_p ?? 0.9, num_predict: params?.max_tokens ?? params?.num_predict ?? 2048 } };
  const res = await fetch(`${baseUrl}/api/generate`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error('Ollama stream failed');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let buf = '';
  while(true){
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream:true });
    const lines = buf.split(/\n+/);
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const json = JSON.parse(trimmed);
        if (typeof json.response === 'string') { raw += json.response; onToken(json.response); }
      } catch { /* ignore */ }
    }
  }
  return raw;
}

async function streamGeminiRaw(prompt: string, params: any, onToken:(t:string)=>void, onDebug?:(info:any)=>void): Promise<string> {
  const apiKey = params?.geminiKey || env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = params?.model || env.GEMINI_MODEL || 'gemini-1.5-flash';
  const baseInstruction = 'You are a Next.js app generator. Output ONLY JSON matching the agreed blueprint schema with keys: pages[], components[], apiRoutes[], prismaModels[]. No markdown, no code fences.';
  const user = `Prompt: ${prompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: baseInstruction + '\n' + user }] }] };
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(`Gemini stream failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let buffer = '';
  let lineCount = 0;
  let objectsParsed = 0;
  let lastCandidateAt = 0;
  while(true){
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    // Gemini may send multiple JSON objects separated by newlines; accumulate by full line
    const lines = buffer.split(/\n/);
    buffer = lines.pop() || '';
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('data:')) line = line.slice(5).trim();
      if (!line || line === '[DONE]') continue;
      lineCount++;
      if (lineCount <= 5 && onDebug) onDebug({ phase:'gemini-line', line });
      try {
        const obj = JSON.parse(line);
        objectsParsed++;
        const candArr = obj?.candidates || [];
        if (Array.isArray(candArr) && candArr.length) {
          for (const c of candArr) {
            // candidate-level safety blocks may appear without content
            const parts = c?.content?.parts || [];
            for (const p of parts) {
              if (typeof p?.text === 'string' && p.text) {
                raw += p.text;
                lastCandidateAt = Date.now();
                onToken(p.text);
              }
            }
          }
        } else if (obj?.content?.parts) {
          // fallback shape
          for (const p of obj.content.parts) {
            if (typeof p?.text === 'string') { raw += p.text; lastCandidateAt = Date.now(); onToken(p.text); }
          }
        } else if (obj?.promptFeedback && onDebug) {
          onDebug({ phase:'gemini-feedback', feedback: obj.promptFeedback });
        }
      } catch (e) {
        if (onDebug) onDebug({ phase:'gemini-parse-error', snippet: line.slice(0,120) });
      }
    }
    // Optional early break if we collected enough raw to look like JSON root
    if (raw.includes('"pages"') && raw.length > 20000) break;
    // timeout safeguard: if >8s since first bytes and no candidate text
    if (!lastCandidateAt && objectsParsed > 3 && raw.length === 0) {
      // keep going until completion; do not abort yet
    }
  }
  if (onDebug) onDebug({ phase:'gemini-summary', lines: lineCount, objects: objectsParsed, chars: raw.length });
  return raw;
}

async function parseRawToBlueprint(rawText: string, userPrompt: string, provider: 'ollama'|'gemini'): Promise<any> {
  if (!rawText.trim()) throw new Error('Empty model output');
  let candidates = [rawText, replaceBacktickContent(rawText)];
  let rawJson: any = null;
  for (const c of candidates) { try { rawJson = salvageJson(c); break; } catch {} }
  if (!rawJson) throw new Error('Invalid JSON from model');
  const parsed = llmRawSchema.safeParse(rawJson);
  if (!parsed.success) {
    const coerce: any = rawJson || {};
    if (!Array.isArray(coerce.pages)) coerce.pages = [];
    if (!Array.isArray(coerce.components)) coerce.components = [];
    if (!Array.isArray(coerce.apiRoutes)) coerce.apiRoutes = [];
    if (!Array.isArray(coerce.prismaModels)) coerce.prismaModels = [];
    const reparsed = llmRawSchema.safeParse(coerce);
    if (!reparsed.success) throw new Error('Schema mismatch');
    return transformRawToBlueprint(reparsed.data, userPrompt);
  }
  const { meta, ...usable } = parsed.data as any;
  return transformRawToBlueprint(usable, userPrompt);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const stream = url.searchParams.get('stream');
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const key = `gen:${userId}`;
  const rate = await checkRate(key, 'generate');
  if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { prompt, name, provider, params } = body || {};
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  if (!validateCsrf(req)) return NextResponse.json({ error: 'CSRF' }, { status: 403 });
  if (prompt.length > 4000) return NextResponse.json({ error: 'Prompt too long' }, { status: 413 });

  if (!stream) {
    try {
      const blueprint = await generateBlueprintUnified(prompt, provider === 'gemini' ? 'gemini':'ollama', params);
      const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : (blueprint?.name ? String(blueprint.name) : 'Generated Project');
      const project = await prisma.project.create({
        data: { name: projectName, prompt, blueprint: JSON.stringify(blueprint), user: { connect: { id: userId } } },
      });
      const createdFiles = await writeGeneratedProject(project.id, blueprint);
      return NextResponse.json({ projectId: project.id, blueprint, createdFiles }, { headers: { 'X-Rate-Remaining': String(rate.remaining) } });
    } catch (e:any) {
      const message = e?.message || 'Generation failed';
      const status = message.startsWith('Invalid JSON') || message.startsWith('Schema mismatch') ? 422 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  }

  return streamify(async push => {
    push('log', { message: 'Starting generation', ts: Date.now() });
    // PlanV2 high fidelity planning phase (now incremental)
    push('step', { id:'parse', status:'active', label:'Planning (V2)' });
  const planSectionTimings: { section:string; ms:number }[] = [];
  let planV2: any = null;
  let fallbackStructure: any = null;
    try {
      planV2 = await generatePlanV2(prompt, provider === 'gemini' ? 'gemini':'ollama', params||{}, ({ section, ms, data }) => {
        if (section !== 'final') {
          planSectionTimings.push({ section, ms });
          push('event', { type:'plan-v2-part', section, ms, size: Array.isArray(data)? data.length : (typeof data==='object'? Object.keys(data||{}).length: 0) });
          if (section === 'routes') {
            // after routes discovered, emit partial plan snapshot so UI can show routes early
            push('event', { type:'plan-v2-snapshot', plan: { routes: data } });
          }
        } else {
          planV2 = data;
          push('event', { type:'plan-v2', plan: planV2 });
        }
      });
      push('log', { message:`PlanV2 complete: ${planV2.entities.length} entities, ${planV2.features.length} features, ${planV2.routes.length} routes`, ts: Date.now() });
      push('event', { type:'plan-v2-metrics', timings: planSectionTimings });
    } catch (e:any) {
      push('log', { message:`PlanV2 failed: ${e.message}`, ts: Date.now() });
      planV2 = null;
      // Fallback: generate unified blueprint so user still gets artifacts
      try {
        push('log', { message:'Falling back to unified blueprint generation…', ts: Date.now() });
        const fallback = await generateBlueprintUnified(prompt, provider === 'gemini' ? 'gemini':'ollama', params);
        // derive a pseudo planV2 minimal (optional)
        planV2 = undefined; // keep null to signal partial; we'll use fallback directly
        // Build structurePlan from fallback blueprint shape
  fallbackStructure = {
          pages: fallback.pages?.map((p:any)=> ({ route:p.route, title:p.title })) || [],
            components: fallback.components?.map((c:any)=> ({ name:c.name })) || [],
            apiRoutes: fallback.apiRoutes?.map((r:any)=> ({ route:r.route, method:r.method||'GET' })) || [],
            prismaModels: fallback.prismaModels?.map((m:any)=> ({ name:m.name, definition:m.definition })) || []
        };
        // emit as structure-plan so UI proceeds with artifact generation
  push('event', { type:'structure-plan', plan: fallbackStructure });
        // For artifact loop below we set structurePlan after section logic
        planSectionTimings.push({ section:'fallback', ms:0 });
      } catch (fe:any) {
        push('log', { message:`Unified fallback failed: ${fe.message}`, ts: Date.now() });
      }
    }
    // Derive legacy structurePlan fallback from PlanV2 if available
    let structurePlan: any = null;
    if (planV2) {
      structurePlan = {
        pages: planV2.routes.filter((r:any)=>r.type==='page').map((r:any)=> ({ route: r.path, title: r.description?.slice(0,40) })),
        components: planV2.components.map((c:any)=> ({ name: c.name })),
        apiRoutes: planV2.routes.filter((r:any)=>r.type==='api').map((r:any)=> ({ route: r.path, method: r.method||'GET' })),
        prismaModels: planV2.prismaModels.map((m:any)=> ({ name: m.name, definition: m.definition }))
      };
    } else if (!structurePlan) {
      // use fallbackStructure if available
      structurePlan = fallbackStructure;
    }
    // Existing structure-first flow (renamed step labels)
    push('step', { id:'parse', status:'done' });
    push('step', { id:'plan', status:'active', label:'Generating artifacts' });

    interface BuiltPage { route:string; title?:string; code:string }
    interface BuiltComponent { name:string; code:string }
    interface BuiltApi { route:string; method?:string; code:string }
    interface BuiltModel { name:string; definition:string }

    const pages: BuiltPage[] = [];
    const components: BuiltComponent[] = [];
    const apiRoutes: BuiltApi[] = [];
    const prismaModels: BuiltModel[] = [];

    const { generateArtifactCode } = await import('@/utils/structure');

    const artifacts: { kind:'page'|'component'|'api'|'model'; ref:any }[] = [];
    const structureProvider: 'gemini'|'ollama' = provider === 'gemini' ? 'gemini' : 'ollama';
    if (structurePlan) {
      structurePlan.pages.forEach((p:any)=> artifacts.push({ kind:'page', ref:p }));
      structurePlan.components.forEach((c:any)=> artifacts.push({ kind:'component', ref:c }));
      structurePlan.apiRoutes.forEach((r:any)=> artifacts.push({ kind:'api', ref:r }));
      structurePlan.prismaModels?.forEach((m:any)=> artifacts.push({ kind:'model', ref:m }));
    }

    // Guarantee at least one artifact if everything failed
    if (!artifacts.length) {
      const defaultPage = { route:'/', title:'Home' };
      artifacts.push({ kind:'page', ref: defaultPage });
      structurePlan = structurePlan || { pages:[defaultPage], components:[], apiRoutes:[], prismaModels:[] };
      push('log', { message:'Inserted default Home page due to empty structure plan', ts: Date.now() });
    }

    const totalArtifacts = artifacts.length;
    push('event', { type:'artifact-total', total: totalArtifacts });

    let completed = 0;

    for (const art of artifacts) {
      const startTs = Date.now();
      const label = art.kind + ':' + (art.ref.route || art.ref.name);
      push('event', { type:'artifact-start', kind: art.kind, ref: art.ref });
      let code = '';
      let attempt = 0;
      const maxAttempts = 2;
      while(attempt < maxAttempts) {
        attempt++;
        try {
          const spec: any = art.kind === 'page' ? { kind:'page', route: art.ref.route }
            : art.kind === 'component' ? { kind:'component', name: art.ref.name }
            : art.kind === 'api' ? { kind:'api', route: art.ref.route, method: art.ref.method }
            : { kind:'model', name: art.ref.name };
          code = await generateArtifactCode(spec, prompt, structurePlan, structureProvider, params||{});
          if (code.trim()) break;
        } catch (e:any) {
          if (attempt >= maxAttempts) {
            push('event', { type:'artifact-failed', kind: art.kind, ref: art.ref, error: e?.message || 'generation failed' });
          }
        }
      }
      if (!code.trim()) {
        // insert placeholder so blueprint stays consistent
        if (art.kind==='page') pages.push({ route: art.ref.route, title: art.ref.title, code: "export default function Page(){return <div>TODO</div>}" });
        else if (art.kind==='component') components.push({ name: art.ref.name, code: "export default function Component(){return <div>TODO</div>}" });
        else if (art.kind==='api') apiRoutes.push({ route: art.ref.route, method: art.ref.method||'GET', code: "export async function GET(){return Response.json({ ok:true })}" });
        else if (art.kind==='model') prismaModels.push({ name: art.ref.name, definition: `model ${art.ref.name} { id String @id }` });
        completed++; push('event', { type:'artifact-complete', kind: art.kind, ref: art.ref, placeholder:true, ms: Date.now()-startTs });
        continue;
      }
      // store
      if (art.kind==='page') pages.push({ route: art.ref.route, title: art.ref.title, code });
      else if (art.kind==='component') components.push({ name: art.ref.name, code });
      else if (art.kind==='api') apiRoutes.push({ route: art.ref.route, method: art.ref.method||'GET', code });
      else if (art.kind==='model') prismaModels.push({ name: art.ref.name, definition: code });
      completed++;
      push('event', { type:'artifact-complete', kind: art.kind, ref: art.ref, ms: Date.now()-startTs });
      push('event', { type:'progress', completed, total: totalArtifacts });
    }

    push('step', { id:'plan', status:'done' });
    push('step', { id:'validate', status:'done', label:'Assembling blueprint' });

    // Assemble blueprint shape consistent with existing writer expectations
    const blueprint = {
      name: name || 'Generated Project',
      planV2: planV2 || undefined,
      pages: pages.map(p=>({ route:p.route, title:p.title, content: p.code })),
      components: components.map(c=>({ name:c.name, content:c.code })),
      apiRoutes: apiRoutes.map(r=>({ route:r.route, method:r.method, content:r.code })),
      prismaModels: prismaModels.map(m=>({ name:m.name, definition:m.definition }))
    } as any;

    push('step', { id:'validate', status:'done' });
    push('step', { id:'write', status:'active', label:'Writing files' });

    const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Generated Project';
    const project = await prisma.project.create({ data: { name: projectName, prompt, blueprint: JSON.stringify(blueprint), user: { connect: { id: userId } } } });
    push('meta', { projectId: project.id });

    const totalFiles = (
      (blueprint.components?.length || 0) +
      (blueprint.pages?.length || 0) +
      (blueprint.apiRoutes?.length || 0) +
      (blueprint.components?.length ? 1 : 0) +
      (blueprint.prismaModels?.length ? 1 : 0)
    );
    push('total', { files: totalFiles });
    let fileCount = 0;
    await writeGeneratedProject(project.id, blueprint, rec => { fileCount++; push('file', { ...rec, index:fileCount, total: totalFiles }); push('log', { message: `Created ${rec.relativePath}`, ts: Date.now() }); });

    push('step', { id:'write', status:'done' });
    push('step', { id:'final', status:'done', label:'Finalizing project' });
    push('blueprint', blueprint);
    push('complete', { projectId: project.id });
    push('log', { message: 'Generation complete (structure-first)', ts: Date.now() });

    // Persist run metrics (plan section timings + file counts)
    try {
      const stepMetrics = { steps: [
        { id:'parse', ms: null }, // server does not currently measure full step durations
        { id:'plan', ms: null },
        { id:'validate', ms: null },
        { id:'write', ms: null },
        { id:'final', ms: null }
      ], planSections: planSectionTimings };
      await prisma.run.create({ data: { projectId: project.id, provider: (provider=== 'gemini' ? 'gemini':'ollama'), files: totalFiles, stepMetrics: JSON.stringify(stepMetrics), diff: null, params: params? JSON.stringify(params): null } });
    } catch (e) {
      // non-fatal
    }
  });
}
