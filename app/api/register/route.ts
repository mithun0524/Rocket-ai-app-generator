import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hash } from 'bcryptjs';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
  }
  if (password.length < 8) return NextResponse.json({ error: 'Password too short' }, { status: 400 });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: 'User exists' }, { status: 409 });
    const passwordHash = await hash(password, 10);
    await prisma.user.create({ data: { email, passwordHash } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
