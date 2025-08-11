"use client";
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
export default function AuthDashboardButton() {
  const { data: session, status } = useSession();
  const router = useRouter();
  function handleClick() {
    if (!session?.user) router.push('/auth/login');
    else router.push('/dashboard');
  }
  return (
    <button
      onClick={handleClick}
      className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 via-pink-600 to-indigo-600 px-8 py-4 text-sm font-semibold shadow-lg shadow-fuchsia-900/40 ring-1 ring-white/10 hover:brightness-110 transition"
      disabled={status==='loading'}
    >
      <span>Open Dashboard</span>
      <span className="inline-block w-4 h-4 bg-fuchsia-400 rounded-full ml-2 animate-pulse" />
    </button>
  );
}
