import { env } from '@/lib/env';
import { generateBlueprint as generateOllamaBlueprint } from './ollama';
import type { Blueprint } from '@/lib/blueprintSchema';
import { llmRawSchema, salvageJson, transformRawToBlueprint } from './blueprintParser';

async function callGeminiRaw(prompt: string, _params?: any, apiKeyOverride?: string, forceJsonInstruction = false): Promise<string> {
  const apiKey = apiKeyOverride || env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = _params?.model || 'gemini-2.5-flash';
  const baseInstruction = 'You are a Next.js app generator. Output ONLY JSON matching the agreed blueprint schema with keys: pages[], components[], apiRoutes[], prismaModels[]. No markdown, no code fences.';
  const extra = forceJsonInstruction ? 'Return strictly valid JSON. Do NOT use backticks. All code must be string values with proper escaped quotes and newlines. If code contains backticks replace them with plain quotes.' : '';
  const user = `Prompt: ${prompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: baseInstruction + '\n' + extra + '\n' + user }] }] };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini request failed');
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
}

function replaceBacktickContent(raw: string): string {
  // Replace content fields using backtick template literals with JSON strings
  return raw.replace(/"content"\s*:\s*`([\s\S]*?)`/g, (_m, inner) => {
    const jsonStr = JSON.stringify(inner); // ensures proper escaping
    return `"content": ${jsonStr}`;
  }).replace(/`{3,}[\s\S]*?`{3,}/g, m => m.replace(/`/g,'')); // strip fenced blocks if any
}

async function generateGeminiBlueprint(prompt: string, params?: any): Promise<Blueprint> {
  const geminiKey = params?.geminiKey as string | undefined; // provided per request (not persisted)
  let rawText = await callGeminiRaw(prompt, params, geminiKey);
  if (!rawText.trim()) return generateOllamaBlueprint(prompt);
  // First sanitation pass for backticks before salvage
  let attemptTexts: string[] = [rawText, replaceBacktickContent(rawText)];
  let rawJson: any = null;
  for (const candidate of attemptTexts) {
    try { rawJson = salvageJson(candidate); break; } catch {}
  }
  if (!rawJson) {
    // Second model attempt with stricter instruction
    const retry = await callGeminiRaw(prompt, params, geminiKey, true);
    const retrySanitized = replaceBacktickContent(retry);
    try { rawJson = salvageJson(retrySanitized); } catch {
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
