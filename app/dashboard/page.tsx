'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface CreatedFile { type: string; relativePath: string; }

export default function DashboardPage() {
  const [prompt, setPrompt] = useState('Simple todo app with add/remove and persistence');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<any>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>('pages/index.tsx');
  const [fileContent, setFileContent] = useState<string>('');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [createdFiles, setCreatedFiles] = useState<CreatedFile[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project');
    if (pid) setProjectId(pid);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const res = await fetch(`/api/files?projectId=${projectId}`);
      const data = await res.json();
      if (res.ok) setFiles(data.files || []);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !activeFile) return;
    (async () => {
      const res = await fetch(`/api/preview?projectId=${projectId}&file=${encodeURIComponent(activeFile)}`);
      if (res.ok) {
        const text = await res.text();
        setFileContent(text);
      }
    })();
  }, [projectId, activeFile]);

  // Build a very lightweight preview HTML (only for pages/index.tsx) from file content
  useEffect(() => {
    if (!fileContent || activeFile !== 'pages/index.tsx') {
      setPreviewHtml('');
      return;
    }
    // Naive transform: strip import/export lines, map default export to Component
    let src = fileContent
      .replace(/import[^;]+;\n?/g, '')
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)?/,'function Component')
      .replace(/export\s+default\s*\(/,'function Component(')
      .replace(/export\s+default\s+\(/,'function Component(')
      .replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/,'class Component');
    if (!/Component\s*\(/.test(src) && !/class Component/.test(src)) {
      // If still no Component, attempt to wrap default export expression
      if (/export\s+default\s+/.test(fileContent)) {
        const expr = fileContent.split(/export\s+default\s+/)[1];
        src = `const Component = ${expr}`;
      }
    }
    const html = `<!doctype html><html><head><meta charset=utf-8 />
<style>body{font-family:system-ui,Arial,sans-serif;margin:16px}</style>
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
</head><body><div id="root">Loading...</div>
<script type="module">
${src}\ntry{ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(typeof Component==='function'?Component:()=>React.createElement('pre',null,'No Component export')));}catch(e){document.getElementById('root').innerText='Preview error: '+e.message;console.error(e)}
</script></body></html>`;
    setPreviewHtml(html);
  }, [fileContent, activeFile]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setCreatedFiles([]);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setProjectId(data.projectId);
      setBlueprint(data.blueprint);
      setCreatedFiles(data.createdFiles || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const iframeSrc = projectId ? `/api/preview?projectId=${projectId}&file=pages/index.tsx` : '';

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-4 p-4">
      <div className="absolute top-2 right-4 text-xs"><Link href="/projects" className="underline text-fuchsia-400">Projects</Link></div>
      <div className="w-1/3 flex flex-col space-y-4">
        {/* Generation Form */}
        <form onSubmit={handleGenerate} className="space-y-4">
          <h1 className="text-2xl font-semibold">Generate App</h1>
          <textarea
            className="w-full h-40 p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring focus:ring-fuchsia-500 text-sm"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            className="px-4 py-2 rounded bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {createdFiles.length > 0 && (
            <div className="bg-gray-900 rounded p-3 max-h-40 overflow-auto text-xs border border-gray-800 space-y-1">
              <div className="font-semibold text-fuchsia-300 mb-1">Created Files ({createdFiles.length})</div>
              {createdFiles.map(cf => (
                <div key={cf.relativePath} className="flex justify-between gap-2">
                  <span className="truncate">{cf.relativePath}</span>
                  <span className="text-gray-500">{cf.type}</span>
                </div>
              ))}
            </div>
          )}
          {blueprint && (
            <details className="bg-gray-900 rounded p-3 text-xs whitespace-pre-wrap max-h-52 overflow-auto">
              <summary className="cursor-pointer">Blueprint JSON</summary>
              {JSON.stringify(blueprint, null, 2)}
            </details>
          )}
          {projectId && (
            <a
              href={`/api/download?projectId=${projectId}`}
              className="inline-block mt-2 text-sm underline text-fuchsia-400 hover:text-fuchsia-300"
            >
              Download Project ZIP
            </a>
          )}
        </form>
        {/* File Explorer */}
        {projectId && (
          <div className="flex-1 min-h-0 flex flex-col border border-gray-800 rounded">
            <div className="px-3 py-2 text-xs font-semibold bg-gray-800 border-b border-gray-700">Files</div>
            <div className="overflow-auto text-xs flex-1">
              {files.length === 0 && <div className="p-3 text-gray-500">No files</div>}
              <ul>
                {files.map(f => (
                  <li key={f}>
                    <button
                      onClick={() => setActiveFile(f)}
                      className={`w-full text-left px-3 py-1 hover:bg-gray-800 ${f === activeFile ? 'bg-gray-800 text-fuchsia-400' : ''}`}
                    >
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="w-2/3 flex flex-col gap-4">
        <div className="flex-1 flex gap-4">
          <div className="w-1/2 border border-gray-800 rounded overflow-hidden flex flex-col">
            <div className="px-3 py-2 text-xs font-semibold bg-gray-800 border-b border-gray-700 flex items-center justify-between">
              <span>{activeFile}</span>
            </div>
            <pre className="flex-1 overflow-auto text-xs p-3 bg-black text-gray-200">{fileContent || 'Select a file'}</pre>
          </div>
          <div className="w-1/2 border border-gray-800 rounded overflow-hidden bg-black">
            {projectId && activeFile === 'pages/index.tsx' && previewHtml ? (
              <iframe title="live-preview" srcDoc={previewHtml} className="w-full h-full bg-white" />
            ) : iframeSrc ? (
              <iframe title="preview" src={iframeSrc} className="w-full h-full bg-white" />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No preview yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
