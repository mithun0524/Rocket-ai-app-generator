import { deriveTargetFiles } from '../rollback';

describe('deriveTargetFiles', () => {
  it('dedupes and limits files', () => {
    const files = deriveTargetFiles({
      writes: [{ path:'a.ts' }, { path:'b.ts' }],
      renames: [{ from:'b.ts', to:'c.ts' }],
      deletes: [{ path:'d.ts' }]
    });
    expect(files).toEqual(['a.ts','b.ts','c.ts','d.ts']);
  });
});
