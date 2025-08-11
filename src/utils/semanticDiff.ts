import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';

export function semanticDiff(a: string, b: string): { changed: boolean, astDiff?: string } {
  try {
    const astA = parse(a, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    const astB = parse(b, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
    // Simple AST string comparison for now
    const genA = generate(astA).code;
    const genB = generate(astB).code;
    return { changed: genA !== genB, astDiff: genA !== genB ? `AST differs` : undefined };
  } catch {
    return { changed: a !== b };
  }
}
