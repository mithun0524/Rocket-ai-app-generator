import { parseOpTags } from '../opTags';
import { applyOpActions } from '../opActions';
import path from 'path';
import fs from 'fs/promises';

jest.mock('@/lib/prisma', () => ({ prisma: { project: { findFirst: jest.fn().mockResolvedValue({ id:'psec', blueprint: JSON.stringify({ version:1, name:'Session', pages:[], components:[], apiRoutes:[], prismaModels:[] }) }), update: jest.fn() } } }));

const baseDir = path.join(process.cwd(), 'tmp-op-sec');

describe('opActions security', () => {
  beforeAll(async () => { await fs.mkdir(baseDir, { recursive: true }); });
  afterAll(async () => { try { await fs.rm(baseDir, { recursive: true, force: true }); } catch {} });

  it('rejects traversal and oversized writes', async () => {
    const large = 'x'.repeat(160_000);
    const spec = `
<op-write path="../outside.txt">SHOULD_SKIP</op-write>
<op-write path="pages/big.tsx">${large}</op-write>
<op-write path="pages/ok.tsx">export default function Page(){return <div>OK</div>}</op-write>`;
    const parsed = parseOpTags(spec);
    const res = await applyOpActions(parsed, { projectId:'psec', baseDir });
    const writtenPaths = res.writes.map(w => w.path);
    expect(writtenPaths).toContain('pages/ok.tsx');
    expect(writtenPaths).not.toContain('../outside.txt');
    expect(writtenPaths).not.toContain('pages/big.tsx');
  });
});
