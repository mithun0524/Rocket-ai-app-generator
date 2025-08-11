import { parseOpTags, hasUnclosedOpWrite } from '../opTags';

describe('parseOpTags', () => {
  it('parses write / rename / delete / deps / summary', () => {
    const input = `
<op-write path="pages/index.tsx" description="home page">
import React from 'react';
export default function Home(){return <div>Hello</div>;}
</op-write>
<op-rename from="old.ts" to="new.ts"></op-rename>
<op-delete path="pages/old.tsx" />
<op-add-dependency packages="zod lodash" />
<op-summary>Did basic changes</op-summary>`;
    const parsed = parseOpTags(input);
    expect(parsed.writes).toHaveLength(1);
    expect(parsed.writes[0].path).toBe('pages/index.tsx');
    expect(parsed.renames[0]).toEqual({ from:'old.ts', to:'new.ts' });
    expect(parsed.deletes[0]).toEqual({ path:'pages/old.tsx' });
    expect(parsed.dependencies.sort()).toEqual(['lodash','zod']);
    expect(parsed.summary).toBe('Did basic changes');
  });

  it('detects unclosed write', () => {
    const bad = '<op-write path="x.ts">const a=1;';
    expect(hasUnclosedOpWrite(bad)).toBe(true);
  });
});
