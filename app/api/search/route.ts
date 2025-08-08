import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

interface Match { path: string; line: number; preview: string }

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: any[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const q = searchParams.get('q')?.trim();
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  if (!q) return NextResponse.json({ matches: [] });
  if (q.length > 80) return NextResponse.json({ error: 'Query too long' }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const base = path.join(process.cwd(), 'generated', projectId);
  const qLower = q.toLowerCase();
  const matches: Match[] = [];
  for await (const file of walk(base)) {
    if (matches.length >= 50) break; // cap
    if (!/\.(tsx?|js|jsx|json|css|prisma)$/i.test(file)) continue;
    let content: string;
    try { content = await fs.readFile(file, 'utf8'); } catch { continue; }
    const rel = path.relative(base, file).replace(/\\/g,'/');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (matches.length >= 50) return;
      if (line.toLowerCase().includes(qLower)) {
        matches.push({ path: rel, line: idx + 1, preview: line.trim().slice(0, 200) });
      }
    });
  }
  return NextResponse.json({ matches });
}
