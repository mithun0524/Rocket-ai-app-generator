import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import { audit } from '@/utils/audit';
import { enqueueInstall, updateInstall } from '@/utils/installQueue';
import { spawn } from 'child_process';

export const runtime = 'nodejs';

export async function POST(req: Request){
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  let body:any; try { body = await req.json(); } catch { return NextResponse.json({ error:'Invalid JSON' }, { status:400 }); }
  const { projectId, packages } = body||{};
  if (!projectId || !Array.isArray(packages) || !packages.length) return NextResponse.json({ error:'Missing projectId/packages' }, { status:400 });
  const project = await prisma.project.findFirst({ where:{ id: projectId, userId: session.user.id } });
  if (!project) return NextResponse.json({ error:'Not found' }, { status:404 });
  const job = enqueueInstall(projectId, packages);
  return new Promise(resolve => {
    const child = spawn(process.platform === 'win32'? 'npm.cmd':'npm',['install','--save',...packages], { cwd: process.cwd() });
    let output='';
    child.stdout.on('data', d=> { output += d.toString(); });
    child.stderr.on('data', d=> { output += d.toString(); });
    child.on('close', async code => {
      const uid = session.user?.id;
      try {
        (prisma as any).auditEvent?.create?.({ data:{ type:'deps.install', userId: uid, projectId, data: JSON.stringify({ packages, code, output: output.slice(0, 5000) }) } });
      } catch {}
      try {
        (prisma as any).opLog?.create?.({ data:{ projectId, operations: JSON.stringify({ writes:[], renames:[], deletes:[], dependencies: packages }), summary: `Dependencies installed (${packages.length})`, snapshot: null, preSnapshot: null, installOutput: output.slice(0,5000) } });
      } catch {}
  if (uid) audit({ type:'deps.install.finish', userId: uid, projectId, message: 'dependency install finished', meta:{ packages, code } });
  updateInstall(job.id, { status: code===0? 'done':'error', output: output.slice(0,8000), code: (code==null? undefined: code) });
      resolve(NextResponse.json({ ok:true, code, output: output.slice(0, 8000) }));
    });
  });
}
