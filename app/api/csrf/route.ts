import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { generateCsrfToken, setCsrfCookie } from '@/utils/csrf';

export async function GET() {
  await getServerSession(authOptions); // ignore result; token not user-bound for now
  const token = generateCsrfToken();
  return setCsrfCookie(token);
}
