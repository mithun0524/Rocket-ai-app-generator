import { env } from '@/lib/env';
import { generateBlueprint as generateOllamaBlueprint } from './ollama';
import type { Blueprint } from '@/lib/blueprintSchema';
import { llmRawSchema, salvageJson, transformRawToBlueprint } from './blueprintParser';

async function callGeminiRaw(prompt: string, _params?: any): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = env.GEMINI_MODEL;
  const system = 'You are a Next.js app generator. Return ONLY JSON for the blueprint schema described previously.';
  const user = `Prompt: ${prompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: system + '\n' + user }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini request failed');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
}

async function generateGeminiBlueprint(prompt: string, params?: any): Promise<Blueprint> {
  const rawText = await callGeminiRaw(prompt, params);
  if (!rawText.trim()) return generateOllamaBlueprint(prompt);
  let rawJson: any;
  try { rawJson = salvageJson(rawText); } catch (e) {
    // second attempt: ask explicitly for JSON only
    const retry = await callGeminiRaw(`${prompt}\nReturn ONLY valid JSON now (no markdown).`);
    try { rawJson = salvageJson(retry); } catch (e2) {
      // fallback to ollama
      return generateOllamaBlueprint(prompt);
    }
  }
  const parsed = llmRawSchema.safeParse(rawJson);
  if (!parsed.success) {
    const coerce: any = rawJson || {};
    if (!Array.isArray(coerce.pages)) coerce.pages = [];
    if (!Array.isArray(coerce.components)) coerce.components = [];
    if (!Array.isArray(coerce.apiRoutes)) coerce.apiRoutes = [];
    const reparsed = llmRawSchema.safeParse(coerce);
    if (!reparsed.success) return generateOllamaBlueprint(prompt);
    return transformRawToBlueprint(reparsed.data, prompt);
  }
  const { meta, ...usable } = parsed.data as any;
  return transformRawToBlueprint(usable, prompt);
}

export async function generateBlueprintUnified(prompt: string, provider: 'ollama' | 'gemini' = 'ollama', params?: any): Promise<Blueprint> {
  if (provider === 'gemini') return generateGeminiBlueprint(prompt, params);
  return generateOllamaBlueprint(prompt, params);
}
