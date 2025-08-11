export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { projectId } = body || {};
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  await prisma.project.delete({ where: { id: projectId, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { projectId, name } = body || {};
  if (!projectId || !name) return NextResponse.json({ error: 'Missing projectId/name' }, { status: 400 });
  await prisma.project.update({ where: { id: projectId, userId: session.user.id }, data: { name: String(name).slice(0,64) } });
  return NextResponse.json({ ok: true });
}
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, status: true, createdAt: true }
  });
  return NextResponse.json({ projects });
}
