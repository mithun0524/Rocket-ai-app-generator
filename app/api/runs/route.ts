import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error:'Missing projectId' }, { status:400 });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const project = await prisma.project.findFirst({ where:{ id: projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error:'Not found' }, { status:404 });
  const runs = await prisma.run.findMany({ where:{ projectId }, orderBy:{ createdAt:'desc' }, take:50 });
  return NextResponse.json({ runs: runs.map(r => {
    let metrics: any = {};
    try { metrics = JSON.parse(r.stepMetrics); } catch { metrics = {}; }
    return { id:r.id, ts:r.createdAt.getTime(), provider:r.provider, files:r.files, stepMetrics: metrics, diff: r.diff? JSON.parse(r.diff): null };
  }) });
}
