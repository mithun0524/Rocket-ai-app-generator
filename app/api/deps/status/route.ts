import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { getInstallStatus } from '@/utils/installQueue';

export async function GET(req: Request){
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId') || undefined;
  const status = getInstallStatus(projectId || undefined);
  return NextResponse.json({ status });
}
