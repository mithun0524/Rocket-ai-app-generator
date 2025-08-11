import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { blueprintSchema, type Blueprint } from '@/lib/blueprintSchema';
import crypto from 'crypto';
import { semanticDiff } from '@/utils/semanticDiff';

interface DiffDetail { type:'added'|'removed'|'changed'; kind:'page'|'component'|'api'; key:string; fromHash?:string; toHash?:string }
interface DiffSummary { total:number; added:number; removed:number; changed:number; details:DiffDetail[] }

function stableHash(src: string){
  return crypto.createHash('sha1').update(src.replace(/\s+/g,'\n').trim()).digest('hex').slice(0,10);
}

function diffBlueprint(a: Blueprint, b: Blueprint): DiffSummary {
  const details: DiffDetail[] = [];
  const indexBy = <T extends { route?:string; name?:string; content?:string; code?:string }>(arr: T[] | undefined) => {
    const map: Record<string, T> = {};
    (arr||[]).forEach(i => { const k = (i as any).route || (i as any).name; if (k) map[k] = i; });
    return map;
  };
  const pagesA = indexBy(a?.pages as any), pagesB = indexBy(b?.pages as any);
  for (const k of new Set([...Object.keys(pagesA), ...Object.keys(pagesB)])) {
    if (!pagesA[k]) details.push({ type:'added', kind:'page', key:k, toHash: stableHash((pagesB[k] as any).content || (pagesB[k] as any).code || '') });
    else if (!pagesB[k]) details.push({ type:'removed', kind:'page', key:k, fromHash: stableHash((pagesA[k] as any).content || (pagesA[k] as any).code || '') });
    else {
      const aContent = (pagesA[k] as any).content || (pagesA[k] as any).code || '';
      const bContent = (pagesB[k] as any).content || (pagesB[k] as any).code || '';
      if (stableHash(aContent) !== stableHash(bContent)) {
        const sem = semanticDiff(aContent, bContent);
        details.push({ type:'changed', kind:'page', key:k, fromHash: stableHash(aContent), toHash: stableHash(bContent), astDiff: sem.astDiff });
      }
    }
  }
  const compsA = indexBy(a?.components as any), compsB = indexBy(b?.components as any);
  for (const k of new Set([...Object.keys(compsA), ...Object.keys(compsB)])) {
    if (!compsA[k]) details.push({ type:'added', kind:'component', key:k, toHash: stableHash((compsB[k] as any).content || (compsB[k] as any).code || '') });
    else if (!compsB[k]) details.push({ type:'removed', kind:'component', key:k, fromHash: stableHash((compsA[k] as any).content || (compsA[k] as any).code || '') });
    else {
      const aContent = (compsA[k] as any).content || (compsA[k] as any).code || '';
      const bContent = (compsB[k] as any).content || (compsB[k] as any).code || '';
      if (stableHash(aContent) !== stableHash(bContent)) {
        const sem = semanticDiff(aContent, bContent);
        details.push({ type:'changed', kind:'component', key:k, fromHash: stableHash(aContent), toHash: stableHash(bContent), astDiff: sem.astDiff });
      }
    }
  }
  const apiA = indexBy(a?.apiRoutes as any), apiB = indexBy(b?.apiRoutes as any);
  for (const k of new Set([...Object.keys(apiA), ...Object.keys(apiB)])) {
    if (!apiA[k]) details.push({ type:'added', kind:'api', key:k, toHash: stableHash((apiB[k] as any).content || (apiB[k] as any).code || '') });
    else if (!apiB[k]) details.push({ type:'removed', kind:'api', key:k, fromHash: stableHash((apiA[k] as any).content || (apiA[k] as any).code || '') });
    else {
      const aContent = (apiA[k] as any).content || (apiA[k] as any).code || '';
      const bContent = (apiB[k] as any).content || (apiB[k] as any).code || '';
      if (stableHash(aContent) !== stableHash(bContent)) {
        const sem = semanticDiff(aContent, bContent);
        details.push({ type:'changed', kind:'api', key:k, fromHash: stableHash(aContent), toHash: stableHash(bContent), astDiff: sem.astDiff });
      }
    }
  }
  return { total: details.length, added: details.filter(d=>d.type==='added').length, removed: details.filter(d=>d.type==='removed').length, changed: details.filter(d=>d.type==='changed').length, details };
}

export async function GET(req: Request){
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const opLogId = searchParams.get('opLogId');
  const mode = searchParams.get('mode') === 'pre' ? 'pre' : 'post';
  if (!projectId || !opLogId) return NextResponse.json({ error:'Missing projectId/opLogId' }, { status:400 });
  const log = await prisma.opLog.findFirst({ where:{ id: opLogId, projectId } });
  if (!log) return NextResponse.json({ error:'Not found' }, { status:404 });
  let current:Blueprint|null=null, target:Blueprint|null=null;
  try { const p = await prisma.project.findFirst({ where:{ id: projectId, userId: session.user.id } }); if (p?.blueprint) current = blueprintSchema.parse(JSON.parse(p.blueprint)); } catch {}
  try { const raw = mode==='pre' && log.preSnapshot ? log.preSnapshot : (log.snapshot||'null'); const parsed = JSON.parse(raw); if (parsed) target = blueprintSchema.parse(parsed); } catch {}
  if (!current || !target) return NextResponse.json({ error:'Missing snapshots' }, { status:404 });
  const diff = diffBlueprint(target, current); // how target differs from current
  return NextResponse.json({ ok:true, diff, mode });
}
