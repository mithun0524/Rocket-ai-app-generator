import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request){
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const type = searchParams.get('type') || undefined;
  const cursor = searchParams.get('cursor') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit')||'50',10), 200);
  const where:any = { userId: session.user.id };
  if (projectId) where.projectId = projectId;
  if (type) where.type = type;
  const query:any = { where, orderBy:{ createdAt:'desc' }, take: limit + 1 };
  if (cursor) { query.cursor = { id: cursor }; query.skip = 1; }
  const rows: any[] = await (prisma as any).auditEvent?.findMany?.(query) || [];
  const hasMore = rows.length > limit;
  const events = hasMore? rows.slice(0, limit): rows;
  return NextResponse.json({ events: events.map(e=> ({ id:e.id, type:e.type, projectId:e.projectId, createdAt:e.createdAt, message: e.message||null, meta: e.meta ? JSON.parse(e.meta): null })), nextCursor: hasMore? events[events.length-1].id: null });
}
