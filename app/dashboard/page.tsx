'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import VSCodeShell from '@/components/vscode/VSCodeShell';

interface CreatedFile { relativePath: string; type: string }
interface Step { id: string; label: string; status: 'pending' | 'active' | 'done' | 'error'; note?: string }

export default function DashboardPage() {
  // Prompt & generation state
  const [prompt, setPrompt] = useState('Realtime multiplayer drawing game with rooms, lobby, drawing phase, voting phase');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdFiles, setCreatedFiles] = useState<CreatedFile[]>([]);
  const [blueprint, setBlueprint] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [showFiles, setShowFiles] = useState(true);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const stepsRef = useRef<Step[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'editor'>('feed'); // mobile switching
  const [logs, setLogs] = useState<{ ts:number; message:string }[]>([]);
  const [totalFiles, setTotalFiles] = useState<number | null>(null);
  const [continueStep, setContinueStep] = useState<'parse'|'plan'|'validate'|'write'>('write');
  const [blueprintDiff, setBlueprintDiff] = useState<any|null>(null);
  const [stepTimings, setStepTimings] = useState<Record<string,{start?:number; end?:number}>>({});
  const [runHistory, setRunHistory] = useState<any[]>([]);
  const historyRef = useRef<any[]>([]);
  const controllerRef = useRef<AbortController|null>(null);
  const [selectiveMode, setSelectiveMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [showDiff, setShowDiff] = useState(true);
  const [showDiffDetail, setShowDiffDetail] = useState(false);
  const [baselineBlueprint, setBaselineBlueprint] = useState<any|null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const pendingStepRef = useRef<string|null>(null);
  const [provider, setProvider] = useState<'ollama' | 'gemini'>('ollama');
  const [geminiKey, setGeminiKey] = useState('');
  const [needGeminiKey, setNeedGeminiKey] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [temperature, setTemperature] = useState(0.1);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [isSplit, setIsSplit] = useState(false);
  const [showIntro, setShowIntro] = useState(true); // new: controls visibility of intro form
  const leftPanelRef = useRef<HTMLDivElement|null>(null);
  const rightPanelRef = useRef<HTMLDivElement|null>(null);
  const formRef = useRef<HTMLFormElement|null>(null); // new: animate form out
  const gsapRef = useRef<any>(null);
  const [streamingFiles, setStreamingFiles] = useState<Record<string,{type:string; size?:number; content:string; done:boolean}>>({});
  const [activeStreamingFile, setActiveStreamingFile] = useState<string|undefined>(undefined);

  // Derived progress from steps
  const totalSteps = steps.length;
  const doneSteps = steps.filter(s=>s.status==='done').length;
  const derivedProgress = totalSteps? Math.round((doneSteps/totalSteps)*100):0;

  // Init from query
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project');
    if (pid) { setProjectId(pid); }
  }, []);

  // Animated progress bar (coarse) while loading
  useEffect(()=> {
    if (!loading) { setProgress(0); return; }
    let raf: number;
    const tick = () => { setProgress(p => Math.min(95, p + Math.max(0.15, (100-p)*0.012))); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  // Helper to update step status
  function updateStep(id: string, patch: Partial<Step>) {
    setSteps(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      stepsRef.current = next; return next;
    });
  }

  function seedSteps() {
    const initial: Step[] = [
      { id: 'parse', label: 'Parsing prompt', status: 'active' },
      { id: 'plan', label: 'Planning blueprint', status: 'pending' },
      { id: 'validate', label: 'Validating schema', status: 'pending' },
      { id: 'write', label: 'Writing files', status: 'pending' },
      { id: 'final', label: 'Finalizing project', status: 'pending' },
    ];
    stepsRef.current = initial; setSteps(initial);
  }

  async function simulateEarlySteps(controller: AbortController) {
    // Sequentially advance first three steps while request in flight
    const advance = async (from: string, to: string, delay: number) => {
      await new Promise(r=>setTimeout(r, delay)); if (controller.signal.aborted) return; updateStep(from, { status: 'done' }); updateStep(to, { status: 'active' }); };
    await advance('parse','plan',400);
    await advance('plan','validate',500);
    updateStep('validate',{ status:'active' });
  }

  // helper to reset controller
  function newController() {
    if (controllerRef.current) controllerRef.current.abort();
    const c = new AbortController();
    controllerRef.current = c; return c;
  }

  // track step timing
  function markStepStart(id:string){ setStepTimings(t=> ({ ...t, [id]: { ...(t[id]||{}), start: Date.now() } })); }
  function markStepEnd(id:string){ setStepTimings(t=> ({ ...t, [id]: { ...(t[id]||{}), end: Date.now() } })); }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (provider==='gemini' && !geminiKey.trim()) { setNeedGeminiKey(true); return; }
    if (!isSplit) setIsSplit(true);
    // focus / scroll editor into view shortly after split trigger
    setTimeout(()=> { rightPanelRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 60);
    const controller = newController();
    setLoading(true); setError(null); setCreatedFiles([]); setBlueprint(null); setProjectId(null);
    setSteps([]); stepsRef.current = []; setLogs([]); setTotalFiles(null); setProgress(0); setBlueprintDiff(null); setStepTimings({}); setSelectiveMode(false); setSelectedFiles(new Set());

    try {
      const res = await fetch('/api/generate?stream=1', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, provider, params:{ temperature, top_p: topP, max_tokens: maxTokens, ...(provider==='gemini'? { geminiKey, model:'gemini-2.5-flash' }: {}) } }), signal: controller.signal });
      if (!res.ok || !res.body) throw new Error('Failed to start generation');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const upsertStep = (id:string, data: Partial<Step>) => {
        const { label: dl, status: ds, note } = (data || {}) as Partial<Step>;
        setSteps((prev: Step[]) => {
          const existing: Step | undefined = prev.find(s=>s.id===id);
          if (existing) return prev.map(s=> {
            if (s.id===id) {
              const newStatus = (data as any).status || s.status;
              if (newStatus==='active' && s.status!=='active') markStepStart(id);
              if (newStatus==='done' && s.status!=='done') markStepEnd(id);
              return { ...s, ...(data as Partial<Step>) } as Step;
            }
            return s;
          });
          const label: string = dl ?? id;
          const status: Step['status'] = (ds as Step['status']) || 'pending';
          if (status==='active') markStepStart(id);
          return [...prev, { id, label, status, ...(note?{note}:{}) }];
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream:true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const lines = part.split('\n').filter(Boolean);
            let eventName = ''; let dataLine = '';
            for (const l of lines) {
              if (l.startsWith('event:')) eventName = l.slice(6).trim();
              else if (l.startsWith('data:')) dataLine += l.slice(5).trim();
            }
            if (!eventName) continue;
            try {
              const payload = dataLine ? JSON.parse(dataLine) : {};
              if (eventName==='step') { upsertStep(payload.id, payload); }
              else if (eventName==='file') { setCreatedFiles(f=>{ const next=[...f, payload]; if (totalFiles) { setProgress(Math.round((next.length/totalFiles)*100)); } return next; }); }
              else if (eventName==='file-start') {
                setStreamingFiles(f=> { const nf={ ...f, [payload.relativePath]: { type: payload.type||'unknown', size: payload.size, content:'', done:false } }; if(!activeStreamingFile) setActiveStreamingFile(payload.relativePath); return nf; });
              }
              else if (eventName==='file-chunk') {
                const rel = payload.relativePath; const chunk = payload.chunk||'';
                setStreamingFiles(f=> { const cur = f[rel]; if(!cur) return f; return { ...f, [rel]: { ...cur, content: cur.content + chunk } }; });
              }
              else if (eventName==='file-end') {
                const rel = payload.relativePath; setStreamingFiles(f=> { const cur = f[rel]; if(!cur) return f; return { ...f, [rel]: { ...cur, done:true } }; });
              }
              else if (eventName==='total') { setTotalFiles(payload.files || 0); }
              else if (eventName==='meta' && payload.projectId) { setProjectId(payload.projectId); }
              else if (eventName==='blueprint') { setBlueprint(payload); }
              else if (eventName==='diff') { setBlueprintDiff(payload); }
              else if (eventName==='log') { setLogs(l=>[...l, payload]); }
              else if (eventName==='error') { setError(payload.message || 'Error'); }
              else if (eventName==='complete') { setProgress(100); finalizeRun(); }
            } catch {}
        }
      }
    } catch (e:any) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally { setLoading(false); }
  }

  function finalizeRun(){
    const summary = Object.entries(stepTimings).map(([id,t])=> ({ id, ms: t.start && t.end ? (t.end - t.start): null }));
    const record = { ts: Date.now(), projectId, steps: summary, files: createdFiles.length, diff: blueprintDiff };
    historyRef.current = [record, ...historyRef.current.slice(0,19)];
    setRunHistory(historyRef.current);
    // fire and forget refresh
    if (projectId) { fetch(`/api/runs?projectId=${projectId}`).then(r=> r.json().then(data=> { if (data.runs) setRunHistory(data.runs); }).catch(()=>{})); }
  }

  useEffect(()=> {
    async function loadRuns(){
      if (!projectId) return;
      try { const res = await fetch(`/api/runs?projectId=${projectId}`); if (!res.ok) return; const data = await res.json(); setRunHistory(data.runs || []); historyRef.current = data.runs || []; }
      catch {}
    }
    loadRuns();
  }, [projectId]);

  async function continueFrom(stepId: string) {
    if (!projectId) return;
    // capture baseline blueprint for diff (only if changing earlier steps or we may want to compare)
    if (['parse','plan','validate'].includes(stepId) && blueprint) setBaselineBlueprint(blueprint);
    const controller = newController();
    setLoading(true); setError(null);
    try {
      const include = stepId==='write' && selectiveMode && selectedFiles.size ? `&include=${encodeURIComponent(Array.from(selectedFiles).join(','))}`:'',
      res = await fetch(`/api/generate/continue?projectId=${projectId}&step=${stepId}${include}&provider=${provider}&temperature=${temperature}&top_p=${topP}&max_tokens=${maxTokens}`, { method:'POST', signal: controller.signal });
      if (!res.ok || !res.body) throw new Error('Failed to start continuation');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer='';
      const upsertStep = (id:string, data: Partial<Step>) => {
        const { label: dl, status: ds, note } = (data || {}) as Partial<Step>;
        setSteps((prev: Step[]) => {
          const existing: Step | undefined = prev.find(s=>s.id===id);
          if (existing) return prev.map(s=> {
            if (s.id===id){
              const newStatus = (data as any).status || s.status;
              if (newStatus==='active' && s.status!=='active') markStepStart(id);
              if (newStatus==='done' && s.status!=='done') markStepEnd(id);
              return { ...s, ...(data as Partial<Step>) } as Step;
            }
            return s;
          });
          const label: string = dl ?? id;
          const status: Step['status'] = (ds as Step['status']) || 'pending';
            if (status==='active') markStepStart(id);
          return [...prev, { id, label, status, ...(note?{note}:{}) }];
        });
      };
      setCreatedFiles([]); setLogs([]); setTotalFiles(null); setProgress(0); setBlueprintDiff(null); setStepTimings({});
      while(true){
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream:true });
        const parts = buffer.split('\n\n'); buffer = parts.pop() || '';
        for(const part of parts){
          const lines = part.split('\n').filter(Boolean); let eventName=''; let dataLine='';
          for (const l of lines){
            if (l.startsWith('event:')) eventName = l.slice(6).trim();
            else if (l.startsWith('data:')) dataLine += l.slice(5).trim();
          }
          if(!eventName) continue;
          try {
            const payload = dataLine? JSON.parse(dataLine):{};
            if(eventName==='step') upsertStep(payload.id, payload);
            else if(eventName==='file') setCreatedFiles(f=>{ const next=[...f, payload]; if (totalFiles) setProgress(Math.round((next.length/totalFiles)*100)); return next; });
            else if (eventName==='file-start') {
              setStreamingFiles(f=> { const nf={ ...f, [payload.relativePath]: { type: payload.type||'unknown', size: payload.size, content:'', done:false } }; if(!activeStreamingFile) setActiveStreamingFile(payload.relativePath); return nf; });
            }
            else if (eventName==='file-chunk') {
              const rel = payload.relativePath; const chunk = payload.chunk||'';
              setStreamingFiles(f=> { const cur = f[rel]; if(!cur) return f; return { ...f, [rel]: { ...cur, content: cur.content + chunk } }; });
            }
            else if (eventName==='file-end') {
              const rel = payload.relativePath; setStreamingFiles(f=> { const cur = f[rel]; if(!cur) return f; return { ...f, [rel]: { ...cur, done:true } }; });
            }
            else if(eventName==='complete') { setProgress(100); finalizeRun(); }
          } catch {}
        }
      }
    } catch(e:any) { if (e.name!=='AbortError') setError(e.message); } finally { setLoading(false); }
  }

  function abortGeneration(){ if (controllerRef.current) { controllerRef.current.abort(); setLoading(false); setLogs(l=>[...l,{ ts:Date.now(), message:'Aborted by user'}]); } }

  // derive pretty durations
  function fmtMs(ms:number|null|undefined){ if(ms==null) return '—'; if (ms<1000) return ms+'ms'; const s=(ms/1000); return (s>=10? s.toFixed(1): s.toFixed(2))+'s'; }

  const Caret = ({open}:{open:boolean}) => (
    <svg className={`w-3 h-3 transition-transform ${open? 'rotate-90':''}`} viewBox="0 0 20 20" fill="currentColor"><path d="M6 4l8 6-8 6V4z"/></svg>
  );
  const FileIcon = () => (<svg className='w-3.5 h-3.5 text-gray-400' viewBox='0 0 20 20' fill='currentColor'><path d="M4 2h6l6 6v10H4V2z"/></svg>);

  const StatusIcon = ({status}:{status:Step['status']}) => {
    if (status==='done') return <svg className='w-4 h-4 text-emerald-400' viewBox='0 0 20 20' fill='currentColor'><path d='M8.5 13.3L4.7 9.5l1.4-1.4 2.4 2.4 5.4-5.4 1.4 1.4-6.8 6.8z'/></svg>;
    if (status==='active') return <div className='w-4 h-4 border-2 border-fuchsia-400 border-t-transparent rounded-full animate-spin'/>;
    if (status==='error') return <svg className='w-4 h-4 text-red-400' viewBox='0 0 24 24' fill='currentColor'><path d='M11 7h2v6h-2zm0 8h2v2h-2z'/><path d='M12 2 1 21h22L12 2z'/></svg>;
    return <div className='w-4 h-4 rounded-full bg-gray-700/60'/>
  };

  // Diff side-by-side viewer (simple JSON pretty print)
  function renderDiffDetail(){
    if (!baselineBlueprint || !blueprint) return null;
    return (
      <div className='grid grid-cols-2 gap-2 text-[10px] max-h-56 overflow-auto border-t border-gray-800/60'>
        <div className='p-2'>
          <div className='text-fuchsia-300 font-semibold mb-1'>Old</div>
          <pre className='whitespace-pre-wrap leading-snug opacity-80'>{JSON.stringify(baselineBlueprint,null,2)}</pre>
        </div>
        <div className='p-2'>
          <div className='text-emerald-300 font-semibold mb-1'>New</div>
          <pre className='whitespace-pre-wrap leading-snug opacity-80'>{JSON.stringify(blueprint,null,2)}</pre>
        </div>
      </div>
    );
  }

  const DiffPanel = blueprintDiff && (
    <div className='border border-gray-800/70 rounded-md bg-black/40 overflow-hidden'>
      <button onClick={()=>setShowDiff(d=>!d)} className='w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-fuchsia-300 hover:bg-gray-900/40'>
        <span>Blueprint Diff</span>
        <span className='flex items-center gap-3 text-[10px]'>
          <span className='text-emerald-400'>+{blueprintDiff.added}</span>
          <span className='text-red-400'>-{blueprintDiff.removed}</span>
          <span className='text-amber-400'>±{blueprintDiff.changed}</span>
          <span className='text-gray-500'>{showDiff? '−':'+'}</span>
        </span>
      </button>
      {showDiff && (
        <div className='text-[10px]'>
          <div className='max-h-32 overflow-auto px-3 pb-2 space-y-1'>
            {blueprintDiff.details && blueprintDiff.details.length ? (
              blueprintDiff.details.slice(0,120).map((d:any,idx:number)=>(
                <div key={idx} className='flex items-start gap-2'>
                  <span className={`px-1 rounded text-[9px] font-mono ${d.type==='added'? 'bg-emerald-900/40 text-emerald-300': d.type==='removed'? 'bg-red-900/40 text-red-300': d.type==='changed'? 'bg-amber-900/40 text-amber-300':'bg-gray-800/60 text-gray-400'}`}>{d.type[0].toUpperCase()}</span>
                  <div className='flex-1 truncate'>
                    <span className='text-gray-300'>{d.path || '(root)'}</span>
                    {d.type==='changed' && <span className='text-gray-500 ml-1'>updated</span>}
                    {d.type==='type-changed' && <span className='text-gray-500 ml-1'>type change</span>}
                  </div>
                </div>
              ))
            ) : blueprintDiff.paths && blueprintDiff.paths.length? (
              blueprintDiff.paths.map((p:string)=>(<div key={p} className='text-gray-400'>{p}</div>))
            ) : <div className='text-gray-500 italic'>No paths changed</div>}
          </div>
          {baselineBlueprint && blueprint && (
            <div className='border-t border-gray-800/60'>
              <button onClick={()=> setShowDiffDetail(v=>!v)} className='w-full text-left px-3 py-2 text-[10px] font-medium flex justify-between items-center hover:bg-gray-900/50'>
                <span>Side-by-side JSON</span>
                <span className='text-gray-500'>{showDiffDetail? 'Hide':'Show'}</span>
              </button>
              {showDiffDetail && renderDiffDetail()}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const HistoryPanel = runHistory.length>0 && (
    <div className='border border-gray-800/70 rounded-md bg-black/40 overflow-hidden'>
      <button onClick={()=>setShowHistory(s=>!s)} className='w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-fuchsia-300 hover:bg-gray-900/40'>Run History<span className='text-[10px] text-gray-400'>{runHistory.length}</span></button>
      {showHistory && (
        <div className='max-h-56 overflow-auto text-[10px] px-3 pb-3 space-y-2'>
          {runHistory.map(r=> (
            <div key={r.ts} className='border border-gray-800/60 rounded p-2 space-y-1'>
              <div className='flex justify-between'><span className='text-gray-300'>{new Date(r.ts).toLocaleTimeString()}</span><span className='text-gray-500'>{r.files} files</span></div>
              <div className='flex flex-wrap gap-2'>
                {r.steps.map((s:any)=> <span key={s.id} className='px-1.5 py-0.5 rounded bg-gray-800 text-gray-300'>{s.id}:{fmtMs(s.ms)}</span>)}
              </div>
              {r.diff && <div className='text-[9px] text-gray-500'>Δ +{r.diff.added} -{r.diff.removed} ±{r.diff.changed}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const runParamsBar = (
    <div className='mt-3 flex flex-wrap gap-2 text-[12px]'>
      <span className='px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700 text-gray-300'>Provider: <span className='text-fuchsia-400 font-medium'>{provider}</span></span>
      <span className='px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700 text-gray-300'>Temp {temperature}</span>
      <span className='px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700 text-gray-300'>Top P {topP}</span>
      <span className='px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700 text-gray-300'>Max {maxTokens}</span>
      {projectId && <span className='px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700 text-gray-300'>ID {projectId.slice(0,6)}</span>}
    </div>
  );

  // FEED PANEL CONTENT
  const FeedPanel = (
    <div className='flex flex-col h-full text-[12px] leading-relaxed'>
      {/* Header */}
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='text-sm font-semibold text-gray-200'>Rocket Dashboard</h2>
          <span className='text-[11px] text-gray-500'>Streaming generation & iteration</span>
        </div>
        <div className='flex gap-2'>
          {loading && <button onClick={abortGeneration} className='px-3 py-1.5 rounded bg-red-600/80 hover:bg-red-600 text-[12px] text-white'>Abort</button>}
          <Link href='/projects' className='text-[12px] text-gray-400 hover:text-gray-200 underline'>Projects</Link>
        </div>
      </div>
      {/* Prompt */}
      <form onSubmit={generate} className='mb-5 space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 backdrop-blur-sm p-4'>
        <label className='text-xs uppercase tracking-wide text-gray-400 font-medium flex items-center justify-between'>
          <span>Prompt</span>
          {doneSteps>0 && <span className='text-[11px] text-gray-500 font-normal'>{doneSteps}/{totalSteps} steps</span>}
        </label>
        <div className='rounded-md border border-gray-800 bg-black/50 relative'>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className='w-full h-32 resize-none bg-transparent rounded-md p-3 outline-none text-[13px] leading-relaxed pr-16 placeholder:text-gray-600' placeholder='Describe your app, features, entities, pages,&#10;Realtime multiplayer drawing game with rooms, lobby, drawing phase, voting phase' />
          {loading && <div className='absolute top-2 right-2 text-[11px] text-fuchsia-400 font-medium'>{Math.max(progress, derivedProgress)}%</div>}
          {(loading || derivedProgress>0) && (
            <div className='h-1 w-full bg-gray-800 overflow-hidden rounded-b-md'>
              <div className='h-full bg-fuchsia-500 transition-all' style={{ width: Math.max(progress, derivedProgress)+'%' }} />
            </div>
          )}
        </div>
        <div className='flex flex-wrap gap-4 items-stretch'>
          <div className='flex items-stretch gap-2 flex-1 min-w-[180px]'>
            <select value={provider} onChange={e=> { const v=e.target.value as 'ollama'|'gemini'; setProvider(v); if (v==='gemini') setNeedGeminiKey(!geminiKey); }} className='px-3 py-2.5 rounded-md bg-gray-800 border border-gray-700 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500'>
              <option value='ollama'>Ollama (local)</option>
              <option value='gemini'>Gemini (cloud)</option>
            </select>
            <button disabled={loading} className='flex-1 px-4 py-2.5 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-[12px] font-medium text-white shadow-sm shadow-black/40'>
              {loading? 'Generating…':'Generate'}
            </button>
          </div>
          <div className='grid grid-cols-3 gap-4 flex-1 min-w-[260px]'>
            <label className='flex flex-col gap-1 text-[11px] text-gray-400'>
              <span className='uppercase tracking-wide flex justify-between'>Temp <span className='text-gray-300'>{temperature}</span></span>
              <input type='range' min={0} max={1} step={0.05} value={temperature} onChange={e=> setTemperature(parseFloat(e.target.value))} />
            </label>
            <label className='flex flex-col gap-1 text-[11px] text-gray-400'>
              <span className='uppercase tracking-wide flex justify-between'>Top P <span className='text-gray-300'>{topP}</span></span>
              <input type='range' min={0} max={1} step={0.05} value={topP} onChange={e=> setTopP(parseFloat(e.target.value))} />
            </label>
            <label className='flex flex-col gap-1 text-[11px] text-gray-400'>
              <span className='uppercase tracking-wide flex justify-between'>Max <span className='text-gray-300'>{maxTokens}</span></span>
              <input type='number' min={128} max={8192} step={64} value={maxTokens} onChange={e=> setMaxTokens(parseInt(e.target.value)||2048)} className='bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500' />
            </label>
          </div>
        </div>
        {runParamsBar}
        {error ? (<div className='text-[12px] text-red-400 font-medium'>{error}</div>) : null}
        {provider==='gemini' && (
          <div className='w-full space-y-2'>
            <label className='block text-[11px] text-left text-gray-400'>Gemini API Key</label>
            <input type='password' value={geminiKey} onChange={e=> { setGeminiKey(e.target.value); if (e.target.value) setNeedGeminiKey(false); }} placeholder='Enter your Gemini key' className='w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500'/>
            {needGeminiKey && <div className='text-[11px] text-red-400'>API key required</div>}
          </div>
        )}
      </form>
      {/* Steps */}
      <div className='space-y-5 overflow-y-auto pr-1 flex-1'>
        <div>
          <div className='flex items-center justify-between mb-2'>
            <h3 className='text-xs font-semibold tracking-wide text-gray-300'>Generation Steps</h3>
            <span className='text-[11px] text-gray-500'>{doneSteps}/{totalSteps}</span>
          </div>
          <div className='space-y-3'>
            {steps.map(s => {
              const timing = stepTimings[s.id];
              const ms = timing?.start && timing?.end ? timing.end - timing.start : null;
              return (
              <div key={s.id} className='flex items-start gap-3 text-[12px]'>
                <StatusIcon status={s.status} />
                <div className='flex-1'>
                  <div className='flex items-center gap-3'>
                    <span className='font-medium text-gray-200'>{s.label}</span>
                    {s.status==='error' && <span className='text-red-400 text-[11px]'>Error</span>}
                    {s.status==='done' && <span className='text-emerald-400 text-[11px]'>Done</span>}
                    {ms!=null && <span className='text-[11px] text-gray-500'>{fmtMs(ms)}</span>}
                  </div>
                  {s.note && <div className='text-gray-400 text-[11px]'>{s.note}</div>}
                </div>
              </div>);
            })}
            {!steps.length && <div className='text-[12px] text-gray-500 italic'>No generation yet.</div>}
          </div>
        </div>

        {DiffPanel && (
          <div className='animate-subtle-float'>
            {DiffPanel}
          </div>
        )}

        {createdFiles.length > 0 && (
          <div className='border border-gray-800/70 rounded-md bg-black/40 overflow-hidden'>
            <button onClick={()=>setShowFiles(s=>!s)} className='w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-fuchsia-300 hover:bg-gray-900/40'>
              <Caret open={showFiles} />Files ({createdFiles.length})
            </button>
            {showFiles && (
              <div className='max-h-48 overflow-auto text-[11px] space-y-1 px-3 pb-3'>
                {createdFiles.slice(0,150).map(f => (
                  <div key={f.relativePath} className='flex items-center gap-2'><FileIcon /><span className='truncate flex-1'>{f.relativePath}</span><span className='text-gray-500'>{f.type}</span></div>
                ))}
                {createdFiles.length > 150 && <div className='text-gray-500 italic'>…more</div>}
              </div>
            )}
          </div>
        )}

        {blueprint && (
          <div className='border border-gray-800/70 rounded-md bg-black/40 overflow-hidden'>
            <button onClick={()=>setShowBlueprint(b=>!b)} className='w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold text-fuchsia-300 hover:bg-gray-900/40'>
              <Caret open={showBlueprint} />Blueprint
            </button>
            {showBlueprint && (
              <div className='max-h-64 overflow-auto text-[10px] px-3 pb-3'>
                <pre className='whitespace-pre-wrap leading-snug'>{JSON.stringify(blueprint, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className='border border-gray-800/70 rounded-md bg-black/40 overflow-hidden'>
            <div className='px-3 py-2 text-[11px] font-semibold text-fuchsia-300 border-b border-gray-800/60 flex justify-between'>
              <span>Logs</span>
              <button onClick={()=> setLogs([])} className='text-[10px] text-gray-500 hover:text-gray-300'>Clear</button>
            </div>
            <div className='max-h-40 overflow-auto text-[10px] font-mono leading-4 px-3 py-2 space-y-0'>
              {logs.slice(-150).map(l => (
                <div key={l.ts+Math.random()} className='text-gray-400'><span className='text-gray-600'>{new Date(l.ts).toLocaleTimeString()} </span>{l.message}</div>
              ))}
            </div>
          </div>
        )}

        {HistoryPanel}
      </div>
    </div>
  );

  const EditorPanel = (
    <div className='h-full w-full relative bg-black/30 backdrop-blur-sm border-t md:border-t-0 md:border-l border-gray-800/60'>
      {/* Preview toggle */}
      {projectId && (
        <div className='absolute top-1 left-2 z-20 flex gap-2'>
          <button onClick={()=> setShowPreview(p=>!p)} className='px-2 py-1 rounded bg-gray-800/70 hover:bg-gray-700 text-[10px] text-gray-200 border border-gray-700'>{showPreview? 'Code':'Preview'}</button>
        </div>
      )}
      {loading && steps.length>0 && (
        <div className='absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10'>
          <div className='bg-gray-900/80 border border-gray-700 rounded-lg p-4 w-64 max-w-full space-y-3 shadow-xl'>
            <div className='text-[11px] font-semibold text-fuchsia-300 tracking-wide'>Generating… {Math.max(progress, derivedProgress)}%</div>
            <div className='space-y-2 max-h-56 overflow-auto pr-1'>
              {steps.map(s=> (
                <div key={s.id} className='flex items-center gap-2 text-[11px]'>
                  <span className={`w-2 h-2 rounded-full ${s.status==='done'?'bg-emerald-400': s.status==='active'?'bg-fuchsia-400 animate-pulse':'bg-gray-600'}`}></span>
                  <span className='flex-1 text-gray-300 truncate'>{s.label}</span>
                  {s.status==='done' && <span className='text-emerald-400'>✔</span>}
                </div>
              ))}
            </div>
            {activeStreamingFile && streamingFiles[activeStreamingFile] && (
              <div className='text-[10px] font-mono bg-black/40 border border-gray-700 rounded p-2 max-h-36 overflow-auto'>
                <div className='mb-1 text-fuchsia-300 truncate'>{activeStreamingFile}</div>
                <pre className='whitespace-pre-wrap leading-snug'>{streamingFiles[activeStreamingFile].content.slice(-4000)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
      {!projectId && !loading && (
        <div className='absolute inset-0 flex flex-col items-center justify-center text-xs text-gray-500 gap-3'>
          <div>No project yet. Generate to start.</div>
        </div>
      )}
      {loading && !steps.length && (
        <div className='absolute top-2 right-3 text-[10px] px-2 py-1 rounded bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-200 shadow'>Generating… {Math.max(progress, derivedProgress)}%</div>
      )}
      {projectId && !showPreview && <VSCodeShell projectId={projectId} />}
      {projectId && showPreview && (
        <iframe key={projectId + String(showPreview)} src={`/api/preview/html?projectId=${projectId}`} className='absolute inset-0 w-full h-full bg-white/5' />
      )}
    </div>
  );

  const ConfirmModal = showConfirm && (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm'>
      <div className='w-full max-w-sm bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-4 shadow-xl'>
        <div className='text-[13px] font-semibold text-fuchsia-300'>Confirm Action</div>
        <div className='text-[11px] text-gray-300 whitespace-pre-line'>{confirmMessage}</div>
        <div className='flex justify-end gap-2 pt-2'>
          <button onClick={cancelAction} className='px-3 py-1.5 text-[11px] rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200'>Cancel</button>
          <button onClick={confirmAction} className='px-3 py-1.5 text-[11px] rounded bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-medium'>Confirm</button>
        </div>
      </div>
    </div>
  );

  function confirmAction(){ const step = pendingStepRef.current; setShowConfirm(false); if (step) continueFrom(step); }
  function cancelAction(){ setShowConfirm(false); pendingStepRef.current=null; }

  function requestContinuation(stepId: string){
    if (!projectId) return;
    let msg = '';
    if (stepId==='write') {
      const selCount = selectedFiles.size;
      msg = selectiveMode && selCount? `Rewrite ${selCount} selected file(s)? This will overwrite their current contents.` : 'Rewrite all generated files? This will overwrite existing files.';
    } else {
      msg = `Regenerate blueprint starting at '${stepId}'. This may change planned files and schema. Continue?`;
    }
    pendingStepRef.current = stepId; setConfirmMessage(msg); setShowConfirm(true);
  }

  // load gsap lazily
  useEffect(()=> { (async ()=> { try { const mod = await import('gsap'); gsapRef.current = mod.gsap; } catch {} })(); }, []);

  // animate on split (intro -> split view)
  useEffect(()=> {
    if (isSplit && showIntro && gsapRef.current && leftPanelRef.current && rightPanelRef.current) {
      const gsap = gsapRef.current;
      const lp = leftPanelRef.current;
      const rp = rightPanelRef.current;
      const frm = formRef.current;
      // initial states
      gsap.set(lp, { flexBasis:'100%', maxWidth:'100%' });
      gsap.set(rp, { flexBasis:'0%', maxWidth:'0%', opacity:0, display:'flex' });
      const tl = gsap.timeline({ defaults:{ ease:'power3.inOut' } });
      if (frm) tl.to(frm, { opacity:0, y:-24, duration:0.35, ease:'power2.out' }, 0);
      tl.to(lp, { flexBasis:'30%', maxWidth:'30%', duration:0.65 }, 0.05);
      tl.to(rp, { flexBasis:'70%', maxWidth:'70%', opacity:1, duration:0.65 }, 0.05);
      tl.add(()=> { setShowIntro(false); });
    }
  }, [isSplit, showIntro]);

  // feed entrance after intro removed
  useEffect(()=> {
    if (!showIntro && isSplit && gsapRef.current) {
      // entrance animation disabled temporarily to resolve build issue
      try { /* gsapRef.current.from('[data-feed-panel]', { opacity:0, y=14, duration:0.45, ease:'power2.out' }); */ } catch {}
    }
  }, [showIntro, isSplit]);

  return (
    <div className='h-[calc(100vh-4rem)] p-0 md:p-2 relative'>
      {ConfirmModal}
      <div className='flex h-full w-full md:rounded-xl md:border md:border-white/5 overflow-hidden bg-black/40 backdrop-blur-sm'>
        <div ref={leftPanelRef} className={`flex flex-col h-full relative ${isSplit? 'border-r border-gray-800/60':''}`} style={!isSplit? { flexBasis:'100%', maxWidth:'100%' }: undefined}>
          {showIntro ? (
            <div className='flex-1 flex items-center justify-center px-6'>
              <form ref={formRef} onSubmit={generate} className='w-full max-w-xl space-y-6'>
                <div className='text-center space-y-1'>
                  <h2 className='text-xl font-semibold text-gray-100'>Generate a Project</h2>
                  <p className='text-sm text-gray-500'>Describe what you want. We will blueprint & scaffold.</p>
                </div>
                <div className='rounded-lg border border-gray-800 bg-black/60 relative'>
                  <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} className='w-full h-40 resize-none bg-transparent rounded-lg p-4 outline-none text-[13px] leading-relaxed pr-16 placeholder:text-gray-600' placeholder='Describe your app, features, entities, pages,&#10;Realtime multiplayer drawing game with rooms, lobby, drawing phase, voting phase' />
                  {loading && <div className='absolute top-2 right-2 text-[11px] text-fuchsia-400 font-medium'>{Math.max(progress, derivedProgress)}%</div>}
                  {(loading || derivedProgress>0) && (
                    <div className='h-1 w-full bg-gray-800 overflow-hidden rounded-b-md'>
                      <div className='h-full bg-fuchsia-500 transition-all' style={{ width: Math.max(progress, derivedProgress)+'%' }} />
                    </div>
                  )}
                </div>
                <div className='flex flex-wrap gap-4'>
                  <select value={provider} onChange={e=> { const v=e.target.value as 'ollama'|'gemini'; setProvider(v); if (v==='gemini') setNeedGeminiKey(!geminiKey); }} className='px-3 py-2.5 rounded-md bg-gray-800 border border-gray-700 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500'>
                    <option value='ollama'>Ollama (local)</option>
                    <option value='gemini'>Gemini (cloud)</option>
                  </select>
                  <label className='flex flex-col text-[11px] text-gray-400'>
                    <span className='uppercase tracking-wide mb-1'>Temp {temperature}</span>
                    <input type='range' min={0} max={1} step={0.05} value={temperature} onChange={e=> setTemperature(parseFloat(e.target.value))} />
                  </label>
                  <label className='flex flex-col text-[11px] text-gray-400'>
                    <span className='uppercase tracking-wide mb-1'>Top P {topP}</span>
                    <input type='range' min={0} max={1} step={0.05} value={topP} onChange={e=> setTopP(parseFloat(e.target.value))} />
                  </label>
                  <label className='flex flex-col text-[11px] text-gray-400'>
                    <span className='uppercase tracking-wide mb-1'>Max {maxTokens}</span>
                    <input type='number' min={128} max={8192} step={64} value={maxTokens} onChange={e=> setMaxTokens(parseInt(e.target.value)||2048)} className='bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 w-28' />
                  </label>
                </div>
                {provider==='gemini' && (
                  <div className='w-full space-y-2'>
                    <label className='block text-[11px] text-left text-gray-400'>Gemini API Key</label>
                    <input type='password' value={geminiKey} onChange={e=> { setGeminiKey(e.target.value); if (e.target.value) setNeedGeminiKey(false); }} placeholder='Enter your Gemini key' className='w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-[12px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500'/>
                    {needGeminiKey && <div className='text-[11px] text-red-400'>API key required</div>}
                  </div>
                )}
                {error ? (<div className='text-[12px] text-red-400 font-medium'>{error}</div>) : null}
                <div className='flex gap-3 pt-2'>
                  <button disabled={loading} className='flex-1 px-6 py-3 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 text-[13px] font-medium text-white disabled:opacity-50 transition'>
                    {loading? 'Generating…':'Generate'}
                  </button>
                  <Link href='/projects' className='px-6 py-3 rounded-md bg-gray-800 hover:bg-gray-700 text-[13px] text-gray-200 transition'>Projects</Link>
                </div>
              </form>
            </div>
          ) : (
            <div data-feed-panel className='flex-1 min-h-0 p-4'>
              {FeedPanel}
            </div>
          )}
        </div>
        {isSplit && (
          <div ref={rightPanelRef} className='flex-1 min-w-0 relative flex'>
            {EditorPanel}
          </div>
        )}
      </div>
    </div>
  );
}

// Tailwind helper animation (if not already globally defined)
// Add to globals.css if desired:
// .animate-fade-in { @apply opacity-0; animation: fadeIn .25s forwards; }
// @keyframes fadeIn { to { opacity:1 } }
