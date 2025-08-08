import { NextResponse } from 'next/server';
import { generateBlueprint } from '@/utils/ollama';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { writeGeneratedProject } from '@/utils/scaffold';
import { checkRate } from '@/utils/rateLimiter';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = `gen:${session.user.id}`;
  const rate = await checkRate(key);
  if (!rate.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  // Safe JSON body parsing to avoid HTML error pages (Unexpected token '<')
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, name } = body || {};
  if (!prompt) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: 'Prompt too long' }, { status: 413 });

  try {
    const blueprint = await generateBlueprint(prompt);
    const project = await prisma.project.create({
      data: {
        name: name || blueprint.name || 'Generated Project',
        prompt,
        blueprint: JSON.stringify(blueprint),
        user: { connect: { email: session.user.email } },
      },
    });

    const createdFiles = await writeGeneratedProject(project.id, blueprint);

    return NextResponse.json({ projectId: project.id, blueprint, createdFiles }, { headers: { 'X-Rate-Remaining': String(rate.remaining) } });
  } catch (e: any) {
    const message = e?.message || 'Generation failed';
    const status = message.startsWith('Invalid JSON') || message.startsWith('Schema mismatch') ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
