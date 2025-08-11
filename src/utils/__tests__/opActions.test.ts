import fs from 'fs/promises';
import path from 'path';
import { applyOpActions } from '../opActions';
import { parseOpTags } from '../opTags';

// Simple mock for prisma used in opActions
jest.mock('@/lib/prisma', () => ({ prisma: { project: { findFirst: jest.fn().mockResolvedValue({ id:'p1', blueprint: JSON.stringify({ name:'Session', pages:[], components:[], apiRoutes:[], prismaModels:[] }) }), update: jest.fn() } } }));

const tempBase = path.join(process.cwd(), 'tmp-op-tests');

describe('applyOpActions', () => {
  beforeAll(async () => { await fs.mkdir(tempBase, { recursive: true }); });
  afterAll(async () => { try { await fs.rm(tempBase, { recursive: true, force: true }); } catch {} });

  it('applies writes / renames / deletes and deps', async () => {
    const spec = `
<op-write path="pages/index.tsx">export default function Home(){return <div>H</div>}</op-write>
<op-write path="components/Button.tsx">export const Button=()=>null</op-write>
<op-rename from="components/Button.tsx" to="components/RenamedButton.tsx"></op-rename>
<op-delete path="pages/missing.tsx" />
<op-add-dependency packages="axios" />`;
    const parsed = parseOpTags(spec);
    const res = await applyOpActions(parsed, { projectId:'p1', baseDir: tempBase });
    expect(res.writes.length).toBe(2);
    expect(res.renames.length).toBe(1);
    expect(res.deletes.length).toBe(1);
    // file rename effect
    const renamedPath = path.join(tempBase, 'components', 'RenamedButton.tsx');
    await expect(fs.stat(renamedPath)).resolves.toBeTruthy();
  });
});
