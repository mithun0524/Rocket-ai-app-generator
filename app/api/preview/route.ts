import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

// /api/preview?projectId=xxx&file=pages/index.tsx
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const file = searchParams.get('file') || 'pages/index.tsx';
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const base = path.join(process.cwd(), 'generated', projectId);
  const target = path.join(base, file);
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = await fs.readFile(target, 'utf8');
    return new NextResponse(data, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  } catch (e: any) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
