import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { parseOpTags, hasUnclosedOpWrite } from '@/utils/opTags';
import { applyOpActions } from '@/utils/opActions';
import { checkRate } from '@/utils/rateLimiter';
import { validateCsrf } from '@/utils/csrf';
import { env } from '@/lib/env';
import { audit } from '@/utils/audit';

export const runtime = 'nodejs';

async function callGemini(prompt: string, params: any): Promise<string> {
  const apiKey = params?.geminiKey || env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = params?.model || env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const system = `You modify a Next.js project. Respond ONLY with operation tags (<op-write>, <op-rename>, <op-delete>, <op-add-dependency>, <op-summary>). Always output complete file contents. No markdown fences, no JSON outside tags.`;
  const body = { contents: [{ parts: [{ text: system + '\n\nUser request:\n' + prompt }] }] };
  const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini request failed');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any)=> p.text).join('\n') || '';
}

async function callOllama(prompt: string, params: any): Promise<string> {
  const baseUrl = env.OLLAMA_BASE_URL; const model = env.OLLAMA_MODEL;
  const system = `You modify a Next.js project. Respond ONLY with operation tags (<op-write>, <op-rename>, <op-delete>, <op-add-dependency>, <op-summary>). Output full file contents. No explanations.`;
  const full = `${system}\n\nUser request:\n${prompt}\nOperations:`;
  const body: any = { model, prompt: full, stream: false, options: { temperature: params?.temperature ?? 0.2 } };
  const res = await fetch(`${baseUrl}/api/generate`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Ollama request failed');
  const data = await res.json();
  return data?.response || '';
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error:'Invalid JSON' }, { status:400 }); }
  const { projectId, message, provider, params } = body || {};
  if (!message) return NextResponse.json({ error:'Missing message' }, { status:400 });
  if (!validateCsrf(req)) return NextResponse.json({ error:'CSRF' }, { status:403 });

  // rate limit per user ops bucket
  const r = await checkRate(session.user.id, 'ops');
  if (!r.allowed) return NextResponse.json({ error:'Rate limit exceeded' }, { status:429, headers:{ 'X-Rate-Remaining':'0' } });

  let pid = projectId;
  if (pid) {
    const existing = await prisma.project.findFirst({ where: { id: pid, userId: session.user.id } });
    if (!existing) return NextResponse.json({ error:'Project not found' }, { status:404 });
  } else {
    const created = await prisma.project.create({ data: { name:'Session', prompt: message, blueprint: JSON.stringify({ name:'Session', pages:[], components:[], apiRoutes:[], prismaModels:[] }), user: { connect: { id: session.user.id } } } });
    pid = created.id;
  }

  const started = Date.now();
  let raw = '';
  try { raw = provider === 'gemini' ? await callGemini(message, params||{}) : await callOllama(message, params||{}); }
  catch (e:any) { return NextResponse.json({ error: e?.message || 'Model error' }, { status:500 }); }

  if (hasUnclosedOpWrite(raw)) return NextResponse.json({ projectId: pid, raw, error:'Unclosed <op-write> tag detected. Please retry.' }, { status:422 });

  const parsed = parseOpTags(raw);
  // capture pre snapshot
  let preBlueprint: any = null;
  try { const p = await prisma.project.findFirst({ where:{ id: pid } }); if (p?.blueprint) preBlueprint = JSON.parse(p.blueprint); } catch {}
  const applied = await applyOpActions(parsed, { projectId: pid });
  const durationMs = Date.now() - started;
  const filesTouched = applied.writes.length + applied.renames.length + applied.deletes.length;
  const bytesWritten = applied.writes.reduce((a,b)=> a + b.bytes, 0);
  // Best-effort operation logging (client may be outdated if migration just ran and regenerate failed on Windows OneDrive)
  try {
  let installOutput: string | undefined = undefined;
  if (applied.dependencies.length){
    installOutput = 'queued';
  }
  (prisma as any).opLog?.create?.({ data: { projectId: pid, operations: JSON.stringify({ writes: applied.writes, renames: applied.renames, deletes: applied.deletes, dependencies: applied.dependencies }), summary: parsed.summary || null, snapshot: JSON.stringify(applied.updatedBlueprint), preSnapshot: preBlueprint ? JSON.stringify(preBlueprint) : null, filesTouched, bytesWritten, durationMs, installOutput } });
  audit({ type:'op.apply', projectId: pid, userId: session.user.id, message: 'op applied', meta:{ filesTouched, bytesWritten, durationMs, deps: applied.dependencies.length } });
  } catch {}
  return NextResponse.json({ projectId: pid, operations: { writes: applied.writes, renames: applied.renames, deletes: applied.deletes, dependencies: applied.dependencies }, blueprint: applied.updatedBlueprint, summary: parsed.summary, raw }, { headers:{ 'X-Rate-Remaining': String(r.remaining) } });
}
