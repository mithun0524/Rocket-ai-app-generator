import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import fs from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const dir = path.join(process.cwd(), 'generated', projectId);
  if (!fs.existsSync(dir)) return NextResponse.json({ error: 'No generated artifacts' }, { status: 404 });

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length > 200) return NextResponse.json({ error: 'Too many files' }, { status: 413 });

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const headers = new Headers({
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${projectId}.zip"`
  });
  archive.directory(dir, false).on('error', (err) => {
    stream.destroy(err);
  });
  archive.finalize();
  archive.pipe(stream as any);
  return new NextResponse(stream as any, { status: 200, headers });
}
