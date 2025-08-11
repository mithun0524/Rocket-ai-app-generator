export interface OpLogOperations { writes?: { path:string }[]; renames?: { from:string; to:string }[]; deletes?: { path:string }[]; }

// Derive candidate file paths to restore for rollback when explicit list not supplied.
export function deriveTargetFiles(ops: OpLogOperations, limit = 200): string[] {
  if (!ops) return [];
  const out: string[] = [];
  for (const w of ops.writes||[]) if (w?.path) out.push(w.path);
  for (const r of ops.renames||[]) { if (r?.from) out.push(r.from); if (r?.to) out.push(r.to); }
  for (const d of ops.deletes||[]) if (d?.path) out.push(d.path);
  return Array.from(new Set(out)).slice(0, limit);
}
