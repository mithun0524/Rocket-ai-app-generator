import { NextResponse } from 'next/server';
export async function POST(request: Request) {
	const session = await getServerSession(authOptions);
	if (!session?.user?.id) return NextResponse.json({ error:'Unauthorized' }, { status:401 });
	if (!validateCsrf(request)) return NextResponse.json({ error:'CSRF' }, { status:403 });
	let body:any; try { body = await request.json(); } catch { return NextResponse.json({ error:'Invalid JSON' }, { status:400 }); }
	const { projectId, opLogId, applyFiles, mode, dryRun } = body || {};
	if (!projectId || !opLogId) return NextResponse.json({ error:'Missing projectId/opLogId' }, { status:400 });
	const project = await prisma.project.findFirst({ where:{ id: projectId, userId: session.user.id } });
	if (!project) return NextResponse.json({ error:'Not found' }, { status:404 });
	const log = await prisma.opLog.findFirst({ where:{ id: opLogId, projectId } });
	if (!log?.snapshot) return NextResponse.json({ error:'Snapshot missing' }, { status:404 });
	let target:any; try { target = JSON.parse(mode==='pre' && log.preSnapshot ? log.preSnapshot : log.snapshot); } catch { return NextResponse.json({ error:'Bad snapshot' }, { status:500 }); }
	const base = path.join(process.cwd(), 'generated', projectId);
	let targetFiles = Array.isArray(applyFiles) ? applyFiles.slice(0,200) : null;
	if (!targetFiles) {
		try {
			const ops = JSON.parse(log.operations);
			const derived: string[] = [];
			for (const w of ops.writes||[]) derived.push(w.path);
			for (const r of ops.renames||[]) { if (r.from) derived.push(r.from); if (r.to) derived.push(r.to); }
			for (const d of ops.deletes||[]) derived.push(d.path);
			targetFiles = derived.slice(0,200);
		} catch {}
	}
	if (dryRun) {
		// Get current file hashes
		const currentHashes = await getFileHashes(base, targetFiles || []);
		// Get snapshot hashes
		const snapHashes: Record<string,string> = {};
		for (const rel of targetFiles||[]) {
			let content:string|undefined;
			if (rel.startsWith('pages/')) {
				const routeGuess = '/' + rel.replace(/^pages\//,'').replace(/\.tsx?$/,'').replace(/index$/,'');
				const page = (target.pages||[]).find((p:any)=> p.route === (routeGuess==='/index'?'/' : routeGuess));
				content = page?.code;
			} else if (rel.startsWith('components/')) {
				const name = rel.split('/').pop()?.replace(/\.tsx?$/,'');
				const comp = (target.components||[]).find((c:any)=> c.name.toLowerCase() === name?.toLowerCase());
				content = comp?.code;
			} else if (rel.startsWith('api/')) {
				const route = '/api/' + rel.replace(/^api\//,'').replace(/\.ts$/,'');
				const api = (target.apiRoutes||[]).find((a:any)=> a.route === route);
				content = api?.code;
			}
			if (!content) continue;
			const hash = require('crypto').createHash('sha256').update(content).digest('hex');
			snapHashes[rel] = hash;
		}
		// Compute delta
		const delta = Object.entries(snapHashes).map(([file, hash])=>({
			file,
			before: currentHashes[file]||null,
			after: hash,
			changed: currentHashes[file]!==hash
		}));
		return NextResponse.json({ dryRun: true, delta });
	}
	// Normal rollback
	const writes:string[] = [];
	let removed:string[] = [];
	if (targetFiles) {
		const unique = Array.from(new Set(targetFiles));
		for (const rel of unique) {
			if (typeof rel !== 'string') continue;
			let content:string|undefined;
			if (rel.startsWith('pages/')) {
				const routeGuess = '/' + rel.replace(/^pages\//,'').replace(/\.tsx?$/,'').replace(/index$/,'');
				const page = (target.pages||[]).find((p:any)=> p.route === (routeGuess==='/index'?'/' : routeGuess));
				content = page?.code;
			} else if (rel.startsWith('components/')) {
				const name = rel.split('/').pop()?.replace(/\.tsx?$/,'');
				const comp = (target.components||[]).find((c:any)=> c.name.toLowerCase() === name?.toLowerCase());
				content = comp?.code;
			} else if (rel.startsWith('api/')) {
				const route = '/api/' + rel.replace(/^api\//,'').replace(/\.ts$/,'');
				const api = (target.apiRoutes||[]).find((a:any)=> a.route === route);
				content = api?.code;
			}
			if (!content) continue;
			const abs = path.join(base, rel);
			await fs.mkdir(path.dirname(abs), { recursive: true });
			await fs.writeFile(abs, content, 'utf8');
			writes.push(rel);
		}
	}
	if (mode==='pre') {
		try {
			const ops = JSON.parse(log.operations);
			for (const r of ops.renames||[]) {
				const toRel = r.to;
				if (typeof toRel==='string' && !writes.includes(toRel)) {
					const abs = path.join(base, toRel);
						try { await fs.unlink(abs); removed.push(toRel); } catch {}
				}
			}
		} catch {}
	}
	return NextResponse.json({ ok: true, writes, removed, blueprint: target, derived: !applyFiles, mode: mode==='pre'?'pre':'post' });
}
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import { getFileHashes } from '@/utils/fileHash';
import path from 'path';
import { validateCsrf } from '@/utils/csrf';
