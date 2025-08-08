import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { writeGeneratedProject } from '@/utils/scaffold';
import { checkRate } from '@/utils/rateLimiter';
import { generateBlueprintUnified } from '@/utils/llm';
import { salvageJson, llmRawSchema, transformRawToBlueprint } from '@/utils/blueprintParser';
import { env } from '@/lib/env';

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

async function streamGeminiRaw(prompt: string, params: any, onToken:(t:string)=>void): Promise<string> {
  const apiKey = params?.geminiKey || env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = params?.model || 'gemini-2.5-flash';
  const baseInstruction = 'You are a Next.js app generator. Output ONLY JSON matching the agreed blueprint schema with keys: pages[], components[], apiRoutes[], prismaModels[]. No markdown, no code fences.';
  const user = `Prompt: ${prompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: baseInstruction + '\n' + user }] }] };
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error('Gemini stream failed');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let buffer = '';
  while(true){
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    const lines = buffer.split(/\n/);
    buffer = lines.pop() || '';
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('data:')) line = line.slice(5).trim();
      if (!line || line === '[DONE]') continue;
      try {
        const obj = JSON.parse(line);
        const cands = obj?.candidates;
        if (Array.isArray(cands)) {
          for (const c of cands) {
            const textParts = c?.content?.parts?.filter((p:any)=>p?.text).map((p:any)=>p.text) || [];
            for (const t of textParts) { raw += t; onToken(t); }
          }
        }
      } catch { /* ignore partial */ }
    }
  }
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
  const rate = await checkRate(key);
  if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { prompt, name, provider, params } = body || {};
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
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
    push('step', { id:'parse', status:'active', label:'Parsing prompt' });

    let rawText = '';
    try {
      if (provider === 'gemini') {
        rawText = await streamGeminiRaw(prompt, params||{}, t => push('token', { text: t, provider:'gemini' }));
      } else {
        rawText = await streamOllamaRaw(prompt, params||{}, t => push('token', { text: t, provider:'ollama' }));
      }
    } catch (e:any) {
      push('error', { message: e?.message || 'Streaming failed' });
      return;
    }

    // Fallback: if streaming produced no text, use non-streaming unified generation
    if (!rawText.trim()) {
      try {
        push('log', { message:'Streaming returned empty output, falling back to non-streaming generation', ts: Date.now() });
        const fallbackBp = await generateBlueprintUnified(prompt, provider === 'gemini' ? 'gemini':'ollama', params);
        // serialize fallback blueprint to rawText for downstream parsing path
        rawText = JSON.stringify({ ...fallbackBp });
      } catch (e:any) {
        push('error', { message: 'Empty model output and fallback failed' });
        return;
      }
    }

    let blueprint: any = null;
    try {
      blueprint = await parseRawToBlueprint(rawText, prompt, provider==='gemini'?'gemini':'ollama');
    } catch (e:any) {
      push('error', { message: e?.message || 'Parse failed' });
      return;
    }

    push('log', { message: 'Blueprint generated', ts: Date.now() });
    push('step', { id:'parse', status:'done' });
    push('step', { id:'plan', status:'done', label:'Planning blueprint' });
    push('step', { id:'validate', status:'done', label:'Validating schema' });
    push('step', { id:'write', status:'active', label:'Writing files' });

    const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : (blueprint?.name ? String(blueprint.name) : 'Generated Project');
    const project = await prisma.project.create({
      data: { name: projectName, prompt, blueprint: JSON.stringify(blueprint), user: { connect: { id: userId } } },
    });
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
    await writeGeneratedProject(project.id, blueprint, rec => { fileCount++; push('file', { ...rec, index: fileCount, total: totalFiles }); push('log', { message: `Created ${rec.relativePath}`, ts: Date.now() }); }, undefined, {
      start: (rec, size) => push('file-start', { relativePath: rec.relativePath, type: rec.type, size }),
      chunk: (rec, chunk) => push('file-chunk', { relativePath: rec.relativePath, chunk }),
      end: (rec) => push('file-end', { relativePath: rec.relativePath })
    });

    push('step', { id:'write', status:'done' });
    push('step', { id:'final', status:'done', label:'Finalizing project' });
    push('blueprint', blueprint);
    push('complete', { projectId: project.id });
    push('log', { message: 'Generation complete', ts: Date.now() });
    try {
      const stepMetrics = JSON.stringify({ steps: ['parse','plan','validate','write','final'].map(id=>({ id, ms: null })) });
      await prisma.run.create({ data: { projectId: project.id, provider: provider==='gemini'?'gemini':'ollama', files: fileCount, stepMetrics, diff: null, params: params? JSON.stringify(params): null } });
    } catch (e) {
      push('log', { message: 'Run persistence failed', ts: Date.now() });
    }
  });
}
