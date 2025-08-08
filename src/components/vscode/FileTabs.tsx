"use client";
import { ReactNode } from 'react';

export interface OpenFile { path: string; dirty?: boolean; }

export default function FileTabs({ files, active, onSelect, onClose }: { files: OpenFile[]; active?: string; onSelect: (p: string)=>void; onClose: (p: string)=>void }) {
  return (
    <div className="flex h-8 select-none overflow-x-auto bg-gray-900 border-b border-gray-800 text-xs">
      {files.map(f => {
        const isActive = f.path === active;
        return (
          <div key={f.path} className={`group flex items-center gap-2 px-3 border-r border-gray-800 cursor-pointer ${isActive ? 'bg-gray-800 text-fuchsia-300' : 'hover:bg-gray-800/60 text-gray-300'}`} onClick={()=>onSelect(f.path)}>
            <span className="font-mono truncate max-w-[160px]">{f.path.split(/[/\\]/).pop()}{f.dirty && '*'}</span>
            <button onClick={(e)=>{ e.stopPropagation(); onClose(f.path); }} className="opacity-0 group-hover:opacity-70 hover:opacity-100 text-gray-400 hover:text-white">✕</button>
          </div>
        );
      })}
    </div>
  );
}
