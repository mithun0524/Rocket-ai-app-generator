import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

interface FileNode { name: string; path: string; type: 'file' | 'folder'; children?: FileNode[] }

function inside(base: string, target: string) {
  const rel = path.relative(base, target).replace(/\\/g,'/');
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function buildTree(dir: string, base: string, depth: number, maxDepth: number): Promise<FileNode[]> {
  if (depth > maxDepth) return [];
  let entries: any[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out: FileNode[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      out.push({ name: e.name, path: rel, type: 'folder', children: await buildTree(full, base, depth + 1, maxDepth) });
    } else {
      out.push({ name: e.name, path: rel, type: 'file' });
    }
  }
  return out.sort((a,b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
}

async function ensureAuthProject(projectId: string | null, userId: string | undefined) {
  if (!projectId) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== userId) return null;
  return project;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const filePath = searchParams.get('path');
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  const project = await ensureAuthProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = path.join(process.cwd(), 'generated', projectId);

  if (!filePath) {
    const tree = await buildTree(base, base, 0, 12);
    return NextResponse.json({ tree });
  }
  const abs = path.join(base, filePath);
  if (!inside(base, abs)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  try {
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) {
      const children = await buildTree(abs, base, 0, 4);
      return NextResponse.json({ directory: filePath, children });
    }
    const data = await fs.readFile(abs, 'utf8');
    return NextResponse.json({ path: filePath, content: data });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const { projectId, path: relPath, content } = body || {};
  if (!projectId || !relPath) return NextResponse.json({ error: 'Missing projectId or path' }, { status: 400 });
  const project = await ensureAuthProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = path.join(process.cwd(), 'generated', projectId);
  const abs = path.join(base, relPath);
  if (!inside(base, abs)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content ?? '', 'utf8');
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const { projectId, from, to } = body || {};
  if (!projectId || !from || !to) return NextResponse.json({ error: 'projectId, from, to required' }, { status: 400 });
  const project = await ensureAuthProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = path.join(process.cwd(), 'generated', projectId);
  const src = path.join(base, from);
  const dest = path.join(base, to);
  if (!inside(base, src) || !inside(base, dest)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try { await fs.rename(src, dest); } catch { return NextResponse.json({ error: 'Rename failed' }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const relPath = searchParams.get('path');
  if (!projectId || !relPath) return NextResponse.json({ error: 'projectId & path required' }, { status: 400 });
  const project = await ensureAuthProject(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = path.join(process.cwd(), 'generated', projectId);
  const abs = path.join(base, relPath);
  if (!inside(base, abs)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  try { await fs.rm(abs, { recursive: true, force: true }); } catch { return NextResponse.json({ error: 'Delete failed' }, { status: 400 }); }
  return NextResponse.json({ ok: true });
}
