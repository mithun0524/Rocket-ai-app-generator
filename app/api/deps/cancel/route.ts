import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { cancelInstall } from '@/utils/installQueue';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  let body:any; try { body = await req.json(); } catch { return NextResponse.json({ error:'Invalid JSON' }, { status:400 }); }
  const { jobId } = body || {};
  if (!jobId) return NextResponse.json({ error:'Missing jobId' }, { status:400 });
  const ok = cancelInstall(jobId);
  return NextResponse.json({ ok });
}
