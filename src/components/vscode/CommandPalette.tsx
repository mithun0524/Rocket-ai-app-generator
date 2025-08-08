"use client";
import { useEffect, useState } from 'react';

interface Command { id: string; title: string; run: ()=>void | Promise<void>; }

export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: ()=>void; commands: Command[] }) {
  const [query, setQuery] = useState('');
  const filtered = commands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-md border border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
        <input autoFocus className="w-full bg-gray-800 px-4 py-3 outline-none text-sm border-b border-gray-700" placeholder="Type a command..." value={query} onChange={e=>setQuery(e.target.value)} />
        <ul className="max-h-72 overflow-y-auto text-sm">
          {filtered.length === 0 && <li className="px-4 py-3 text-gray-500">No matches</li>}
          {filtered.map(c => (
            <li key={c.id}>
              <button onClick={async ()=>{ await c.run(); onClose(); }} className="w-full text-left px-4 py-2 hover:bg-gray-800 focus:bg-gray-800 outline-none">{c.title}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
