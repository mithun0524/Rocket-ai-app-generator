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
      try { await cb(push); push('done',{}); } catch (e:any) { push('error',{ message: e?.message || 'Continuation failed' }); } finally { controller.close(); }
    }
  });
  return new Response(readable, { headers: { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive' } });
}

const STEP_ORDER = ['parse','plan','validate','write','final'] as const;

type StepId = typeof STEP_ORDER[number];

function diffBlueprint(oldBp: any, newBp: any) {
  if (!oldBp) return { added: Object.keys(newBp||{}).length, removed:0, changed:0, paths: [] as string[], details: [] as any[] };
  const details: any[] = [];
  let added=0, removed=0, changed=0;
  function diffValue(path: string, a: any, b: any) {
    if (a === undefined && b !== undefined) { added++; details.push({ path, type:'added', value:b }); return; }
    if (b === undefined && a !== undefined) { removed++; details.push({ path, type:'removed', prev:a }); return; }
    if (typeof a !== typeof b) { changed++; details.push({ path, type:'type-changed', prev: a, next: b }); return; }
    if (Array.isArray(a) && Array.isArray(b)) {
      // crude array diff by identity keys (route/name) or index
      const max = Math.max(a.length, b.length);
      const indexByKey = (arr:any[]) => {
        const map = new Map<string, any>();
        arr.forEach(item => {
          const key = item?.route || item?.name || item?.title || JSON.stringify(item).slice(0,40);
          map.set(key, item);
        });
        return map;
      };
      const aMap = indexByKey(a); const bMap = indexByKey(b);
      const keys = new Set([...aMap.keys(), ...bMap.keys()]);
      for (const k of keys) {
        const av = aMap.get(k); const bv = bMap.get(k);
        if (av && !bv) { removed++; details.push({ path: path + '/' + k, type:'removed', prev: av }); }
        else if (!av && bv) { added++; details.push({ path: path + '/' + k, type:'added', value: bv }); }
        else if (av && bv) {
          if (JSON.stringify(av) !== JSON.stringify(bv)) {
            changed++; details.push({ path: path + '/' + k, type:'changed', prev: av, next: bv });
          }
        }
      }
      return;
    }
    if (a && typeof a === 'object' && b && typeof b === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) diffValue(path ? path + '.' + k : k, a[k], b[k]);
      return;
    }
    if (a !== b) { changed++; details.push({ path, type:'changed', prev:a, next:b }); }
  }
  diffValue('', oldBp, newBp);
  const paths = Array.from(new Set(details.map(d=>d.path.split(/[\/]/)[0].split('.')[0]).filter(Boolean)));
  return { added, removed, changed, paths, details };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const start: StepId = (url.searchParams.get('step') as StepId) || 'write';
  const projectId = url.searchParams.get('projectId');
  const providerParam = url.searchParams.get('provider');
  const provider: 'ollama'|'gemini' = providerParam === 'gemini' ? 'gemini' : 'ollama';
  const includeParam = url.searchParams.get('include');
  const includePaths = includeParam ? includeParam.split(',').map(s=>s.trim()).filter(Boolean) : undefined;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  if (!STEP_ORDER.includes(start)) return NextResponse.json({ error: 'Invalid step' }, { status: 400 });

  const rateKey = `continue:${session.user.id}`;
  const rate = await checkRate(rateKey);
  if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const oldBlueprint = project.blueprint ? JSON.parse(project.blueprint) : null;

  return streamify(async push => {
    push('log', { message: `Continuing from step: ${start}`, ts: Date.now() });
    if (includePaths?.length) push('log', { message:`Selective rewrite of ${includePaths.length} file(s)`, ts: Date.now() });
    push('meta', { projectId });

    let blueprint: any = null;
    const activate = (id: StepId, label: string) => push('step', { id, status:'active', label });
    const done = (id: StepId, label?: string) => push('step', { id, status:'done', ...(label?{label}:{}) });

    const temperatureParam = url.searchParams.get('temperature');
    const topPParam = url.searchParams.get('top_p');
    const maxTokensParam = url.searchParams.get('max_tokens');
    const params: any = {};
    if (temperatureParam) params.temperature = parseFloat(temperatureParam);
    if (topPParam) params.top_p = parseFloat(topPParam);
    if (maxTokensParam) params.max_tokens = parseInt(maxTokensParam);

    for (const step of STEP_ORDER) {
      if (STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(start)) continue;
      if (step === 'final') {
        done('final','Finalizing project');
        push('blueprint', blueprint || oldBlueprint);
        push('complete', { projectId });
        push('log', { message: 'Continuation complete', ts: Date.now() });
        try {
          const stepMetrics = JSON.stringify({ steps: STEP_ORDER.map(s=>({ id:s, ms:null })) });
          await prisma.run.create({ data: { projectId, provider, files: (blueprint?.components?.length||0)+(blueprint?.pages?.length||0)+(blueprint?.apiRoutes?.length||0), stepMetrics, diff: null, params: Object.keys(params).length? JSON.stringify(params): null } });
        } catch {}
        break;
      }
      if (step === 'parse') {
        activate('parse','Parsing prompt');
        blueprint = await generateBlueprintUnified(project.prompt, provider, params);
        push('log', { message:'Prompt parsed & blueprint regenerated', ts: Date.now() });
        done('parse');
      } else if (step === 'plan') {
        activate('plan','Planning blueprint');
        if (!blueprint) { blueprint = await generateBlueprintUnified(project.prompt, provider, params); push('log', { message:'Blueprint regenerated (plan)', ts: Date.now() }); }
        done('plan');
      } else if (step === 'validate') {
        activate('validate','Validating schema');
        if (!blueprint) { blueprint = await generateBlueprintUnified(project.prompt, provider, params); push('log', { message:'Blueprint regenerated (validate)', ts: Date.now() }); }
        done('validate');
      } else if (step === 'write') {
        activate('write','Writing files');
        if (!blueprint) blueprint = oldBlueprint; else {
          const diff = diffBlueprint(oldBlueprint, blueprint);
          push('diff', diff);
          await prisma.project.update({ where:{ id: projectId }, data: { blueprint: JSON.stringify(blueprint) } });
          push('log', { message:'Project blueprint updated in DB', ts: Date.now() });
        }
        const totalFiles = (
          (blueprint.components?.length || 0) +
          (blueprint.pages?.length || 0) +
          (blueprint.apiRoutes?.length || 0) +
          (blueprint.components?.length ? 1 : 0) +
          (blueprint.prismaModels?.length ? 1 : 0)
        );
        push('total', { files: totalFiles });
        let fileCount = 0;
        await writeGeneratedProject(projectId, blueprint, rec => { fileCount++; push('file', { ...rec, index:fileCount, total: totalFiles }); push('log', { message: `${includePaths? 'Rewrote':'Wrote'} ${rec.relativePath}`, ts: Date.now() }); }, includePaths);
        done('write');
      }
    }
  });
}
