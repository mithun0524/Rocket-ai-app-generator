'use client';
import { signIn } from 'next-auth/react';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await signIn('credentials', { redirect: false, email, password });
    if (res?.error) {
      setError(res.error);
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
      </div>
      <div>
        <label className="block text-sm mb-1">Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700" />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 py-2 rounded font-semibold">Login</button>
    </form>
  );
}
