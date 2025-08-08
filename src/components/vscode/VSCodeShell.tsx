"use client";
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import FileTabs from './FileTabs';
import CommandPalette from './CommandPalette';

const Monaco = dynamic(()=>import('@/components/CodeEditor'), { ssr:false });

interface FileNode { name: string; path: string; type: 'file' | 'folder'; children?: FileNode[] }

export default function VSCodeShell({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [openFiles, setOpenFiles] = useState<{ path: string; value: string; dirty?: boolean }[]>([]);
  const [active, setActive] = useState<string | undefined>();
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [palette, setPalette] = useState(false);
  // new: baselines & diff UI
  const [baseline, setBaseline] = useState<Record<string,string>>({});
  const [showDiff, setShowDiff] = useState(false);

  const activeFile = openFiles.find(f => f.path === active);

  const fetchTree = useCallback(async () => {
    const r = await fetch(`/api/file?projectId=${projectId}`);
    if (r.ok) { const data = await r.json(); setTree(data.tree || []); }
  }, [projectId]);
  useEffect(()=>{ fetchTree(); }, [fetchTree]);

  const openFile = useCallback(async (p: string) => {
    if (openFiles.some(f => f.path === p)) { setActive(p); return; }
    const r = await fetch(`/api/file?projectId=${projectId}&path=${encodeURIComponent(p)}`);
    if (!r.ok) return; const data = await r.json();
    setOpenFiles(f => [...f, { path: p, value: data.content || '' }]);
    setActive(p);
    setBaseline(b => b[p] ? b : { ...b, [p]: data.content || '' });
  }, [openFiles, projectId]);

  const saveFile = useCallback(async (p: string) => {
    const file = openFiles.find(f => f.path === p); if (!file) return;
    await fetch('/api/file', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ projectId, path: p, content: file.value }) });
    setOpenFiles(fs => fs.map(f => f.path === p ? { ...f, dirty:false } : f));
  }, [openFiles, projectId]);

  const rollbackFile = useCallback((p: string) => {
    setOpenFiles(fs => fs.map(f => f.path === p ? { ...f, value: baseline[p], dirty:false } : f));
  }, [baseline]);

  const updateValue = (p: string, v: string) => {
    setOpenFiles(fs => fs.map(f => f.path === p ? { ...f, value: v, dirty: (baseline[p] ?? f.value) !== v } : f));
  };

  const renderTree = (nodes: FileNode[], depth=0) => (
    <ul>
      {nodes.map(n => (
        <li key={n.path}>
          {n.type === 'file' ? (
            <button onClick={()=>openFile(n.path)} className={`w-full text-left px-2 py-1 text-xs font-mono hover:bg-gray-800 ${active===n.path?'text-fuchsia-400':''}`} style={{ paddingLeft: depth*12 + 8 }}>{n.name}</button>
          ) : (
            <div className="text-xs font-semibold text-gray-400" style={{ paddingLeft: depth*12 + 8 }}>{n.name}</div>
          )}
          {n.children && renderTree(n.children, depth+1)}
        </li>
      ))}
    </ul>
  );

  useEffect(()=>{
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='s') { e.preventDefault(); if (active) saveFile(active); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='p') { e.preventDefault(); setPalette(p=>!p); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='d') { e.preventDefault(); if (active && baseline[active]) setShowDiff(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, saveFile, baseline]);

  useEffect(()=>{
    if (!showPreview) return;
    const entry = openFiles.find(f => /(^|\/)pages\//.test(f.path));
    if (!entry) { setPreviewHtml('<div style="padding:12px;font-family:system-ui;color:#aaa">Open a page file to preview</div>'); return; }
    // naive transform for index like before
    let src = entry.value.replace(/import[^;]+;\n?/g,'');
    if (!/export\s+default/.test(src)) src = `export default function Page(){return <div>${entry.path}</div>;}`;
    const html = `<!doctype html><html><head><meta charset=utf-8 /><style>body{font-family:system-ui;margin:16px}</style><script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script><script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script></head><body><div id="root">Loading...</div><script type="module">${src}\ntry{ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Page));}catch(e){document.getElementById('root').innerText='Preview error: '+e.message;}</script></body></html>`;
    setPreviewHtml(html);
  }, [showPreview, openFiles]);

  // Simple line diff algorithm
  function buildDiff(a: string, b: string) {
    const aLines = a.split(/\r?\n/);
    const bLines = b.split(/\r?\n/);
    const diff: { type: 'same'|'add'|'remove'; text: string }[] = [];
    let i=0,j=0;
    while (i < aLines.length || j < bLines.length) {
      if (aLines[i] === bLines[j]) { diff.push({ type:'same', text: aLines[i] ?? '' }); i++; j++; continue; }
      if (bLines[j] !== undefined && !aLines.slice(i+1).includes(bLines[j])) { diff.push({ type:'remove', text: aLines[i] ?? '' }); i++; continue; }
      if (bLines[j] !== undefined && aLines.slice(i).includes(bLines[j])) { diff.push({ type:'add', text: bLines[j] }); j++; continue; }
      if (aLines[i] !== undefined) { diff.push({ type:'remove', text: aLines[i] }); i++; }
      if (bLines[j] !== undefined) { diff.push({ type:'add', text: bLines[j] }); j++; }
    }
    return diff;
  }
  const currentBaseline = active && baseline[active];
  const diffData = active && currentBaseline !== undefined ? buildDiff(currentBaseline, activeFile?.value || '') : [];
  const hasChanges = !!(active && activeFile && currentBaseline !== undefined && currentBaseline !== activeFile.value);

  const commands = [
    { id: 'save', title: 'File: Save', run: ()=> active && saveFile(active) },
    { id: 'saveAll', title: 'File: Save All', run: async () => { for (const f of openFiles.filter(f=>f.dirty)) await saveFile(f.path); } },
    { id: 'togglePreview', title: showPreview? 'View: Hide Preview':'View: Show Preview', run: ()=> setShowPreview(v=>!v) },
    { id: 'refreshTree', title: 'Project: Refresh Tree', run: fetchTree },
    { id: 'diff', title: 'File: Show Diff', run: ()=> hasChanges && setShowDiff(true) },
    { id: 'rollback', title: 'File: Rollback to Baseline', run: ()=> active && hasChanges && rollbackFile(active) }
  ];

  return (
    <div className="flex h-[calc(100vh-12rem)] border border-gray-800 rounded bg-black/40 relative">
      {/* Diff Modal */}
      {showDiff && active && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[min(900px,95vw)] max-h-[85vh] bg-gray-900 border border-gray-700 rounded shadow-xl flex flex-col">
            <div className="px-4 py-2 flex items-center gap-3 border-b border-gray-700 text-xs">
              <span className="font-semibold text-fuchsia-300">Diff: {active}</span>
              <button onClick={()=> rollbackFile(active)} disabled={!hasChanges} className="ml-auto px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 disabled:opacity-40 text-[11px]">Rollback</button>
              <button onClick={()=> setShowDiff(false)} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-[11px]">Close</button>
            </div>
            <div className="flex-1 overflow-auto text-[11px] font-mono leading-4 p-3 space-y-0">
              {diffData.map((d,idx)=>(
                <div key={idx} className={
                  d.type==='same'? 'text-gray-400': d.type==='add'? 'text-emerald-400':'text-red-400'
                }>
                  <span className="select-none mr-1 opacity-60">{d.type==='same'? ' ':' '+(d.type==='add'? '+':'-')}</span>{d.text}
                </div>
              ))}
              {!diffData.length && <div className="text-gray-500">No differences.</div>}
            </div>
          </div>
        </div>
      )}
      <div className="w-64 flex flex-col border-r border-gray-800">
        <div className="px-3 h-8 flex items-center text-xs font-semibold bg-gray-800 border-b border-gray-700">EXPLORER</div>
        <div className="flex-1 overflow-auto text-xs">
          {tree ? renderTree(tree) : <div className="p-3 text-gray-500">Loading...</div>}
        </div>
        <button onClick={fetchTree} className="m-2 px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700">Refresh</button>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <FileTabs files={openFiles.map(f=>({ path:f.path, dirty:f.dirty }))} active={active} onSelect={p=>setActive(p)} onClose={p=> setOpenFiles(fs=>fs.filter(f=>f.path!==p))} />
        <div className="flex items-center gap-2 h-8 px-3 border-b border-gray-800 text-xs bg-gray-900">
          <button onClick={()=> active && saveFile(active)} disabled={!activeFile?.dirty} className="px-2 py-1 rounded bg-fuchsia-600 disabled:opacity-40">Save</button>
          <button onClick={()=> setShowPreview(v=>!v)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">{showPreview?'Hide':'Show'} Preview</button>
          <button onClick={()=> setPalette(true)} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">Palette</button>
          <button onClick={()=> active && hasChanges && setShowDiff(true)} disabled={!hasChanges} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">Diff</button>
          <button onClick={()=> active && hasChanges && rollbackFile(active)} disabled={!hasChanges} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-40">Rollback</button>
          <div className="ml-auto truncate text-gray-400">{active || 'No file selected'}</div>
        </div>
        <div className="flex-1 flex min-h-0">
          <div className={showPreview? 'w-1/2 border-r border-gray-800':'w-full'}>
            {activeFile ? (
              <Monaco path={activeFile.path} value={activeFile.value} onChange={(v)=> updateValue(activeFile.path, v ?? '')} />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">Open a file</div>
            )}
          </div>
          {showPreview && (
            <div className="flex-1 relative">
              <iframe title="preview" className="absolute inset-0 w-full h-full bg-white" srcDoc={previewHtml} />
            </div>
          )}
        </div>
      </div>
      <CommandPalette open={palette} onClose={()=> setPalette(false)} commands={commands} />
    </div>
  );
}
