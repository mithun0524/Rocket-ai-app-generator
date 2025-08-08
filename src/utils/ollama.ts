import type { Blueprint } from '../lib/blueprintSchema';
import { env } from '@/lib/env';
import { llmRawSchema, salvageJson, transformRawToBlueprint } from './blueprintParser';

export async function generateBlueprint(prompt: string, params?: any): Promise<Blueprint> {
  const baseUrl = env.OLLAMA_BASE_URL;
  const model = env.OLLAMA_MODEL;
  const system = `ROLE: Autonomous Next.js code generation agent.\nYou silently ANALYZE -> PLAN -> OUTPUT.\nYou must output ONLY VALID JSON (no backticks, no markdown, no commentary).\nSCHEMA: { "pages": { "route"?: string; "title"?: string; "name"?: string; "content": string; }[], "components": { "name": string; "content": string; }[], "apiRoutes": { "route"?: string; "name"?: string; "method"?: "GET"|"POST"|"PUT"|"DELETE"; "content": string; }[], "schema": string, "meta"?: { "plan"?: string[] } }\nSTEPS (meta.plan): short bullet list of planned artifacts (kept brief).\nCONSTRAINTS:\n- Every array key present; empty array if none.\n- No empty content: each content contains minimal runnable TypeScript/React (App Router compatible).\n- Prefer functional React components with default export for pages.\n- Component names PascalCase alphanumeric.\n- Routes start with '/'; homepage '/'.\n- apiRoutes methods limited to GET/POST/PUT/DELETE.\n- All referenced components imported or defined.\n- No placeholders like TODO / ... / <Insert>.\n- No explanatory prose outside JSON.\nIf previous attempt invalid, regenerate clean JSON.\nOUTPUT: JSON ONLY.`;

  async function callModel(mainPrompt: string) {
    const body: any = { model, prompt: mainPrompt, stream: false, options: { temperature: params?.temperature ?? 0.1, top_p: params?.top_p ?? 0.9, num_predict: params?.max_tokens ?? params?.num_predict ?? 2048 } };
    const res = await fetch(`${baseUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error('Ollama request failed');
    const data = await res.json();
    return data.response || data;
  }

  const primaryPrompt = `${system}\nUser Prompt: ${prompt}\nReturn JSON now:`;
  let rawText = await callModel(primaryPrompt);
  let rawJson: any;
  try { rawJson = salvageJson(rawText); } catch (err) {
    const retryPrompt = `${system}\nThe previous output was INVALID JSON. Re-output VALID JSON ONLY now for: ${prompt}`;
    rawText = await callModel(retryPrompt);
    try { rawJson = salvageJson(rawText); } catch (err2) {
      const snippet = rawText.slice(0, 400).replace(/\s+/g,' ').trim();
      throw new Error(`Invalid JSON: model output not parseable (snippet: ${snippet})`);
    }
  }
  const parsedRaw = llmRawSchema.safeParse(rawJson);
  if (!parsedRaw.success) {
    const coerce: any = rawJson || {};
    if (!Array.isArray(coerce.pages)) coerce.pages = [];
    if (!Array.isArray(coerce.components)) coerce.components = [];
    if (!Array.isArray(coerce.apiRoutes)) coerce.apiRoutes = [];
    const reparsed = llmRawSchema.safeParse(coerce);
    if (!reparsed.success) throw new Error('Schema mismatch: model JSON shape invalid');
    return transformRawToBlueprint(reparsed.data, prompt);
  }
  const { meta, ...usable } = parsedRaw.data as any;
  return transformRawToBlueprint(usable, prompt);
}
