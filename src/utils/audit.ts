import { prisma } from '@/lib/prisma';

type AuditParams = { projectId: string; userId: string; type: string; message?: string; meta?: any };

export async function audit(event: AuditParams) {
  try {
    // Sanitize type and message
    const type = String(event.type||'').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,32);
    const message = String(event.message||'').slice(0,512);
    let meta = null;
    if (event.meta) {
      try {
        const raw = JSON.stringify(event.meta);
        meta = raw.length > 2000 ? raw.slice(0,2000) : raw;
      } catch {}
    }
    await (prisma as any).auditEvent.create({
      data: {
        projectId: event.projectId,
        userId: event.userId,
        type,
        message,
        meta,
      },
    });
  } catch (err) {
    console.error('audit log failed', err);
  }
}
