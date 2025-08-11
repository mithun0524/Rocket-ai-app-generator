import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error:'Missing projectId' }, { status:400 });
  const proj = await prisma.project.findFirst({ where:{ id: projectId, userId: session.user.id } });
  if (!proj) return NextResponse.json({ error:'Not found' }, { status:404 });
  const logs = await prisma.opLog.findMany({ where:{ projectId: proj.id }, orderBy:{ createdAt:'desc' }, take: 50 });
    const mapped = logs.map(l => {
        let operations: any = {}; try { operations = JSON.parse(l.operations); } catch {}
        const anyLog: any = l as any;
        return { id: l.id, summary: l.summary, createdAt: l.createdAt, operations, snapshot: !!l.snapshot, preSnapshot: l.preSnapshot ? true : false, hasPre: !!l.preSnapshot, filesTouched: anyLog.filesTouched, bytesWritten: anyLog.bytesWritten, durationMs: anyLog.durationMs };
      });
    return NextResponse.json({ logs: mapped });
}
