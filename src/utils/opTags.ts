// Neutral operation tag parsing (clean-room original)
// Supported tags (all must contain full file contents when writing):
// <op-write path="..." description="..."> ... file content ... </op-write>
// <op-rename from="old" to="new"></op-rename>
// <op-delete path="..." /> OR <op-delete path="..."></op-delete>
// <op-add-dependency packages="pkg1 pkg2" />
// <op-summary>short summary</op-summary>

export interface OpWriteTag { path: string; content: string; description?: string }
export interface OpRenameTag { from: string; to: string }
export interface OpDeleteTag { path: string }
export type OpDependencyTag = string[]; // packages

export interface OpParsedTags {
  writes: OpWriteTag[];
  renames: OpRenameTag[];
  deletes: OpDeleteTag[];
  dependencies: OpDependencyTag;
  summary?: string | null;
  raw: string;
}

function extractTagBlocks(src: string, tag: string): RegExpMatchArray[] {
  // Use a manually built scanner to avoid catastrophic backtracking with nested angle brackets.
  const openRe = new RegExp(`<${tag}([^>]*)>`, 'gi');
  const results: RegExpMatchArray[] = [];
  let match: RegExpMatchArray | null;
  while ((match = openRe.exec(src)) !== null) {
    const attrs = match[1] || '';
    const startContentIdx = openRe.lastIndex;
    const closeTag = new RegExp(`</${tag}>`, 'i');
    closeTag.lastIndex = startContentIdx;
    const rest = src.slice(startContentIdx);
    const closeIdxRel = rest.search(closeTag);
    if (closeIdxRel === -1) break; // unclosed, ignore
    const endIdx = startContentIdx + closeIdxRel;
    const inner = src.slice(startContentIdx, endIdx);
    // fabricate a RegExpMatchArray-like tuple so downstream logic stays same
    const fake: any = [match[0] + inner + `</${tag}>`, attrs, inner];
    results.push(fake as RegExpMatchArray);
    // advance pointer after closing tag
    openRe.lastIndex = endIdx + (`</${tag}>`).length;
  }
  return results;
}

function getAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]+)"`);
  return re.exec(attrs)?.[1];
}

export function parseOpTags(full: string): OpParsedTags {
  const writes: OpWriteTag[] = [];
  const renames: OpRenameTag[] = [];
  const deletes: OpDeleteTag[] = [];
  const dependencies: string[] = [];
  let summary: string | null = null;

  // writes
  for (const block of extractTagBlocks(full, 'op-write')) {
    const attrs = block[1] || '';
    let content = (block[2] || '').trim();
    if (/^```/.test(content)) { // strip accidental fences
      content = content.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/```$/, '').trim();
    }
    const p = getAttr(attrs, 'path');
    if (!p) continue;
    const description = getAttr(attrs, 'description');
    writes.push({ path: p, content, description });
  }

  // renames
  for (const block of extractTagBlocks(full, 'op-rename')) {
    const attrs = block[1] || '';
    const from = getAttr(attrs, 'from');
    const to = getAttr(attrs, 'to');
    if (from && to) renames.push({ from, to });
  }

  // deletes (self closing or paired)
  const delRe = /<op-delete([^>]*)>(?:<\/op-delete>)?/gi; let dm: RegExpExecArray | null;
  while ((dm = delRe.exec(full)) !== null) {
    const p = getAttr(dm[1] || '', 'path'); if (p) deletes.push({ path: p });
  }

  // dependencies
  const depRe = /<op-add-dependency([^>]*)>(?:<\/op-add-dependency>)?/gi; let dep: RegExpExecArray | null;
  while ((dep = depRe.exec(full)) !== null) {
    const pkgs = getAttr(dep[1] || '', 'packages');
    if (pkgs) pkgs.split(/\s+/).filter(Boolean).forEach(pkg => { if (!dependencies.includes(pkg)) dependencies.push(pkg); });
  }

  // summary
  const sum = /<op-summary>([\s\S]*?)<\/op-summary>/i.exec(full);
  if (sum) summary = sum[1].trim();

  return { writes, renames, deletes, dependencies, summary, raw: full };
}

export function hasUnclosedOpWrite(text: string): boolean {
  const opens = (text.match(/<op-write\b/gi) || []).length;
  const closes = (text.match(/<\/op-write>/gi) || []).length;
  return opens !== closes;
}
