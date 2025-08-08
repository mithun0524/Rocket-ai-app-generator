import './globals.css';
import { ReactNode } from 'react';
import AuthProvider from '@/components/AuthProvider';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import LogoutButton from '@/components/LogoutButton';

export const metadata = {
  title: 'Rocket AI App Generator',
  description: 'Generate full-stack apps from prompts',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased font-sans relative overflow-x-hidden">
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[80rem] rounded-full bg-fuchsia-600/10 blur-3xl" />
          <div className="absolute top-1/3 -left-32 w-[50rem] h-[50rem] rounded-full bg-cyan-500/10 blur-3xl" />
        </div>
        <AuthProvider session={session}>
          <header className="relative z-10 border-b border-white/10 backdrop-blur supports-[backdrop-filter]:bg-gray-950/40">
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="text-fuchsia-400">🚀 Rocket</span>
              </Link>
              <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
                <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
                <Link href="/projects" className="hover:text-white">Projects</Link>
                {session?.user ? (
                  <>
                    <span className="text-gray-500 text-xs">{session.user.email}</span>
                    <LogoutButton />
                  </>
                ) : (
                  <>
                    <Link href="/auth/login" className="hover:text-white">Login</Link>
                    <Link href="/auth/register" className="hover:text-white">Register</Link>
                  </>
                )}
                <a href="https://ollama.com" target="_blank" className="hover:text-white">Ollama</a>
              </nav>
            </div>
          </header>
          <div className="relative z-10">
            {children}
          </div>
          <footer className="relative z-10 mt-24 border-t border-white/10 py-10 text-center text-xs text-gray-500">
            <p>Rocket AI App Generator &middot; Local LLM powered scaffolding</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
