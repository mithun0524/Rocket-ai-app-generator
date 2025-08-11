import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

export async function getFileHashes(baseDir: string, files?: string[]): Promise<Record<string,string>> {
  const result: Record<string,string> = {};
  if (!baseDir) return result;
  if (!files || files.length === 0) return result;
  for (const rel of files) {
    try {
      const abs = path.join(baseDir, rel);
      const data = await fs.readFile(abs);
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      result[rel] = hash;
    } catch {}
  }
  return result;
}
