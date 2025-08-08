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
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[80rem] rounded-full bg-fuchsia-600/10 blur-3xl" />
          <div className="absolute top-1/3 -left-32 w-[50rem] h-[50rem] rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-0 right-0 w-[40rem] h-[40rem] rounded-full bg-pink-600/10 blur-3xl" />
        </div>
        <AuthProvider session={session}>
          {/* HEADER */}
          <header className="relative z-20 border-b border-white/10 backdrop-blur supports-[backdrop-filter]:bg-gray-950/60">
            <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 font-semibold group">
                <span className="relative inline-flex items-center gap-1 text-fuchsia-300 group-hover:text-fuchsia-200 transition">
                  <span className="text-lg">🚀</span>
                  <span className="bg-gradient-to-r from-fuchsia-300 via-pink-300 to-cyan-200 bg-clip-text text-transparent">Rocket</span>
                </span>
              </Link>
              <nav className="hidden md:flex items-center gap-7 text-sm text-gray-300">
                <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
                <Link href="/projects" className="hover:text-white transition">Projects</Link>
                <Link href="/" className="hover:text-white transition">Landing</Link>
                <a href="https://ollama.com" target="_blank" className="hover:text-white transition">Ollama</a>
                <a href="https://github.com/mithun0524/Rocket-ai-app-generator" target="_blank" className="relative inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.08.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.62 7.62 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
                  <span>GitHub</span>
                </a>
                {session?.user ? (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 text-xs">{session.user.email}</span>
                    <LogoutButton />
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <Link href="/auth/login" className="hover:text-white transition">Login</Link>
                    <Link href="/auth/register" className="px-3 py-1.5 rounded-md bg-gradient-to-r from-fuchsia-600 to-pink-600 text-xs font-medium hover:brightness-110 shadow shadow-fuchsia-900/40">Register</Link>
                  </div>
                )}
              </nav>
            </div>
            {/* subtle bottom gradient line */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-fuchsia-500/40 to-transparent" />
          </header>
          {/* MAIN CONTENT */}
          <div className="relative z-10">{children}</div>
          {/* FOOTER */}
          <footer className="relative z-20 mt-32 border-t border-white/10 bg-gray-950/70 backdrop-blur">
            <div className="mx-auto max-w-7xl px-6 py-14 grid gap-12 md:grid-cols-4 text-sm">
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-semibold text-fuchsia-300">
                  <span>🚀 Rocket</span>
                </div>
                <p className="text-[12px] leading-relaxed text-gray-400 pr-4">Prompt → Blueprint → Diff → Preview → Iterate. Local + cloud provider abstraction with deterministic scaffolding.</p>
                <div className="flex gap-3 pt-1">
                  <a href="https://github.com/mithun0524/Rocket-ai-app-generator" target="_blank" className="text-gray-500 hover:text-fuchsia-300 transition" aria-label="GitHub repo">GitHub</a>
                  <a href="/dashboard" className="text-gray-500 hover:text-fuchsia-300 transition">Dashboard</a>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">Platform</h3>
                <ul className="space-y-2 text-gray-400 text-[12px]">
                  <li><Link href="/projects" className="hover:text-fuchsia-300">Projects</Link></li>
                  <li><Link href="/dashboard" className="hover:text-fuchsia-300">Generation</Link></li>
                  <li><Link href="/auth/register" className="hover:text-fuchsia-300">Register</Link></li>
                  <li><Link href="/auth/login" className="hover:text-fuchsia-300">Login</Link></li>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">Features</h3>
                <ul className="space-y-2 text-gray-400 text-[12px]">
                  <li>Streaming Steps</li>
                  <li>Deep Blueprint Diff</li>
                  <li>Selective Rewrite</li>
                  <li>Persisted History</li>
                  <li>Live Preview</li>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold tracking-wider uppercase text-gray-400">Tech</h3>
                <ul className="space-y-2 text-gray-400 text-[12px]">
                  <li>Next.js App Router</li>
                  <li>Prisma + SQLite</li>
                  <li>Ollama / Gemini</li>
                  <li>Zod Schemas</li>
                  <li>SSE Streaming</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 py-5 text-center text-[11px] text-gray-500">
              <span>© {new Date().getFullYear()} Rocket · Local-first AI App Generation</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
