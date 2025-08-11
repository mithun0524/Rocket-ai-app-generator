import fs from 'fs';
import path from 'path';

interface InstallJob { id:string; projectId:string; packages:string[]; status:'queued'|'running'|'done'|'error'; output:string; code?:number; startedAt?:number; endedAt?:number }

const queue: InstallJob[] = [];
const byProject = new Map<string, InstallJob>();
const runningJobs = new Map<string, any>(); // jobId -> child process
const MAX_CONCURRENT = 2;
const PERSIST_PATH = path.join(process.cwd(), 'tmp-install-queue.json');

function loadPersisted(){
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const raw = fs.readFileSync(PERSIST_PATH,'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((j:any)=> {
          // revive only non-running jobs; running jobs revert to queued
            const job: InstallJob = { id: j.id, projectId: j.projectId, packages: j.packages||[], status: (j.status==='running'?'queued': j.status)||'queued', output: j.output||'', code: j.code, startedAt: j.startedAt, endedAt: j.endedAt };
            queue.push(job); byProject.set(job.projectId, job);
        });
      }
    }
  } catch {}
}

function persist(){
  try { fs.writeFileSync(PERSIST_PATH, JSON.stringify(queue.slice(-200), null, 2)); } catch {}
}

loadPersisted();

function runNext(){
  const runningCount = queue.filter(j=> j.status==='running').length;
  if (runningCount >= MAX_CONCURRENT) return;
  const next = queue.find(j=> j.status==='queued');
  if (!next) return;
  next.status='running'; next.startedAt=Date.now();
  persist();
}

export function enqueueInstall(projectId: string, packages: string[]): InstallJob {
  const id = Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  const job: InstallJob = { id, projectId, packages: packages.slice(0,50), status:'queued', output:'' };
  queue.push(job); byProject.set(projectId, job); persist(); runNext(); return job;
}

export function updateInstallJob(id: string, patch: Partial<InstallJob>) {
  const job = queue.find(j=> j.id===id); if (!job) return;
  Object.assign(job, patch);
  if (patch.status && ['done','error','cancelled'].includes(patch.status)) { job.endedAt = Date.now(); }
  persist();
  if (patch.status==='done' || patch.status==='error' || patch.status==='cancelled') setTimeout(()=>{ runNext(); }, 15);
}
export function cancelInstall(id:string){
  const job = queue.find(j=> j.id===id);
  if (!job || job.status!=='running') return false;
  const proc = runningJobs.get(id);
  if (proc) {
    try { proc.kill(); } catch {}
    runningJobs.delete(id);
  }
  job.status = 'cancelled';
  job.endedAt = Date.now();
  persist();
  setTimeout(()=>{ runNext(); }, 15);
  return true;
}
}

export function getInstallStatus(projectId?:string){
  if (projectId) return byProject.get(projectId) || null;
  return queue.slice(-50).reverse();
}
