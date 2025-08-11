import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

export function generateCsrfToken(): string { return randomBytes(16).toString('hex'); }

export function setCsrfCookie(token: string) {
  const res = NextResponse.json({ token });
  res.cookies.set('csrf-token', token, { httpOnly: false, sameSite: 'lax', path: '/' });
  return res;
}

export function extractCookieMap(cookieHeader: string | null) {
  if (!cookieHeader) return {} as Record<string,string>;
  return Object.fromEntries(cookieHeader.split(/;\s*/).filter(Boolean).map(p=>{ const i=p.indexOf('='); return i===-1? [p,'']:[p.slice(0,i), decodeURIComponent(p.slice(i+1))]; }));
}

export function validateCsrf(req: Request): boolean {
  const header = req.headers.get('x-csrf-token') || '';
  const cookies = extractCookieMap(req.headers.get('cookie'));
  const token = cookies['csrf-token'];
  return !!token && token === header;
}
