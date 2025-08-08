import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

// Recursively list files under generated/<projectId>
async function walk(dir: string, base: string, acc: string[], limit: number) {
  if (acc.length >= limit) return acc;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (acc.length >= limit) break;
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      await walk(full, base, acc, limit);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const baseDir = path.join(process.cwd(), 'generated', projectId);
  try {
    const stat = await fs.stat(baseDir);
    if (!stat.isDirectory()) return NextResponse.json({ files: [] });
  } catch {
    return NextResponse.json({ files: [] });
  }
  const files = await walk(baseDir, baseDir, [], 300);
  files.sort();
  return NextResponse.json({ files });
}
