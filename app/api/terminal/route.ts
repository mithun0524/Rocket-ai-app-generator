import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { spawn } from 'child_process';

// Very constrained command allowlist for safety
const ALLOW = new Set(['ls','dir','echo','cat','type','node','npm','yarn','pnpm']);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const { projectId, command } = body || {};
  if (!projectId || !command) return NextResponse.json({ error: 'Missing projectId or command' }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parts = command.split(/\s+/).filter(Boolean);
  const bin = parts[0];
  if (!ALLOW.has(bin)) return NextResponse.json({ error: 'Command not allowed' }, { status: 400 });
  return new Promise((resolve) => {
    const proc = spawn(bin, parts.slice(1), { cwd: process.cwd(), shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      resolve(NextResponse.json({ code, stdout: out, stderr: err }));
    });
  });
}
