import { parseOpTags } from '../opTags';
import { applyOpActions } from '../opActions';
import fs from 'fs/promises';
import path from 'path';

jest.mock('@/lib/prisma', () => ({ prisma: { project: { findFirst: jest.fn().mockImplementation(({ where }:any)=> Promise.resolve({ id: where.id, blueprint: JSON.stringify({ name:'Session', pages:[], components:[], apiRoutes:[], prismaModels:[] }) })), update: jest.fn() } } }));

// This test simulates a write + rename + delete cycle and ensures applyOpActions logs operations enabling rollback logic (indirect test)

describe('rollback prep', () => {
  const base = path.join(process.cwd(),'tmp-rollback');
  beforeAll(async ()=> { await fs.mkdir(base,{recursive:true}); });
  afterAll(async ()=> { try { await fs.rm(base,{recursive:true,force:true}); } catch{} });
  it('captures writes and renames for rollback derivation', async () => {
    const spec = `<op-write path="pages/index.tsx">export default function Home(){return <div>Hi</div>}</op-write>
<op-write path="components/A.tsx">export const A=()=>null</op-write>
<op-rename from="components/A.tsx" to="components/B.tsx"></op-rename>
<op-delete path="pages/missing.tsx" />`;
    const parsed = parseOpTags(spec);
    const res = await applyOpActions(parsed, { projectId:'p2', baseDir: base });
    expect(res.writes.map(w=>w.path)).toContain('pages/index.tsx');
    expect(res.renames[0]).toEqual({ from:'components/A.tsx', to:'components/B.tsx' });
    expect(res.deletes[0].path).toBe('pages/missing.tsx');
  });
});
