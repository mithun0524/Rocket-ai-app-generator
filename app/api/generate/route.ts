import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { writeGeneratedProject } from '@/utils/scaffold';
import { checkRate } from '@/utils/rateLimiter';
import { generateBlueprintUnified } from '@/utils/llm';

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

export async function POST(req: Request) {
  const url = new URL(req.url);
  const stream = url.searchParams.get('stream');
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id; // assured by check above
  const userEmail = session.user.email as string; // retained if needed elsewhere
  const key = `gen:${userId}`;
  const rate = await checkRate(key);
  if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { prompt, name, provider, params } = body || {};
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: 'Prompt too long' }, { status: 413 });

  if (!stream) {
    // non streaming legacy
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

  // streaming mode
  return streamify(async push => {
    push('log', { message: 'Starting generation', ts: Date.now() });
    push('step', { id:'parse', status:'active', label:'Parsing prompt' });
    const blueprint = await generateBlueprintUnified(prompt, provider === 'gemini' ? 'gemini':'ollama', params);
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

    // compute total files (include barrel & prisma if present)
    const totalFiles = (
      (blueprint.components?.length || 0) +
      (blueprint.pages?.length || 0) +
      (blueprint.apiRoutes?.length || 0) +
      (blueprint.components?.length ? 1 : 0) + // barrel
      (blueprint.prismaModels?.length ? 1 : 0)
    );
    push('total', { files: totalFiles });

    let fileCount = 0;
    await writeGeneratedProject(project.id, blueprint, rec => { fileCount++; push('file', { ...rec, index: fileCount, total: totalFiles }); push('log', { message: `Created ${rec.relativePath}`, ts: Date.now() }); });

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
