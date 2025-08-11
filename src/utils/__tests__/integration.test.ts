import { parseOpTags } from '../opTags';
import { applyOpActions } from '../opActions';
import { deriveTargetFiles } from '../rollback';
import { prisma } from '@/lib/prisma';

// Light integration test mocking prisma minimal surface
jest.mock('@/lib/prisma', () => {
  const projectStore: Record<string, any> = {};
  return { prisma: {
    project: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => projectStore[where.id] || null),
      create: jest.fn().mockImplementation(async ({ data }: any) => { projectStore[data.id||'p-int'] = { ...data, id: data.id||'p-int' }; return projectStore[data.id||'p-int']; }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => { const p = projectStore[where.id]; if (p) { Object.assign(p, data); } return p; })
    },
    opLog: { create: jest.fn(), findMany: jest.fn() },
    auditEvent: { create: jest.fn(), findMany: jest.fn() }
  }};
});

describe('end-to-end op -> rollback derivation', () => {
  it('applies ops and derives rollback targets', async () => {
    const ops = `<op-write path="pages/index.tsx">export default function Home(){return <div>Home</div>}</op-write>\n`+
      `<op-write path="components/Widget.tsx">export const Widget=()=>null</op-write>\n`+
      `<op-rename from="components/Widget.tsx" to="components/RenamedWidget.tsx"></op-rename>\n`+
      `<op-delete path="pages/old.tsx" />`;
    const parsed = parseOpTags(ops);
    const res = await applyOpActions(parsed, { projectId: 'p-int', baseDir: 'tmp-int' });
    const files = deriveTargetFiles({ writes: res.writes.map(w=>({ path: w.path })), renames: res.renames.map(r=>({ from:r.from, to:r.to })), deletes: res.deletes.map(d=>({ path:d.path })) });
    expect(files).toContain('pages/index.tsx');
    expect(files).toContain('components/RenamedWidget.tsx');
  });
});
