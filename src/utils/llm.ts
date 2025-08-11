import { env } from '@/lib/env';
import { generateBlueprint as generateOllamaBlueprint } from './ollama';
import type { Blueprint } from '@/lib/blueprintSchema';
import { llmRawSchema, salvageJson, transformRawToBlueprint } from './blueprintParser';

async function callGeminiRaw(prompt: string, _params?: any, apiKeyOverride?: string, forceJsonInstruction = false): Promise<string> {
  const apiKey = apiKeyOverride || env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key missing');
  const model = _params?.model || env.GEMINI_MODEL || 'gemini-1.5-flash';
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

async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, { method:'GET' });
    return res.ok;
  } catch { return false; }
}

function minimalBlueprint(prompt: string): Blueprint {
  return {
  version: 1,
    name: 'Minimal Project',
    description: `Fallback for: ${prompt.slice(0,80)}`,
    pages: [{ route: '/', title: 'Home', components: [], code: "export default function Page(){return <div>Fallback Home</div>}" }],
    components: [],
    apiRoutes: [],
    prismaModels: []
  };
}

async function generateGeminiBlueprint(prompt: string, params?: any): Promise<Blueprint> {
  const geminiKey = params?.geminiKey as string | undefined;
  let rawText = await callGeminiRaw(prompt, params, geminiKey);
  if (!rawText.trim()) throw new Error('GeminiEmpty');
  // First sanitation pass for backticks before salvage
  let attemptTexts: string[] = [rawText, replaceBacktickContent(rawText)];
  let rawJson: any = null;
  for (const candidate of attemptTexts) {
    try { rawJson = salvageJson(candidate); break; } catch {}
  }
  if (!rawJson) {
    const retry = await callGeminiRaw(prompt, params, geminiKey, true);
    const retrySanitized = replaceBacktickContent(retry);
    try { rawJson = salvageJson(retrySanitized); } catch {
      throw new Error('GeminiUnparseable');
    }
  }
  const parsed = llmRawSchema.safeParse(rawJson);
  if (!parsed.success) {
    const coerce: any = rawJson || {};
    if (!Array.isArray(coerce.pages)) coerce.pages = [];
    if (!Array.isArray(coerce.components)) coerce.components = [];
    if (!Array.isArray(coerce.apiRoutes)) coerce.apiRoutes = [];
    const reparsed = llmRawSchema.safeParse(coerce);
    if (!reparsed.success) throw new Error('GeminiSchema');
    return transformRawToBlueprint(reparsed.data, prompt);
  }
  const { meta, ...usable } = parsed.data as any;
  return transformRawToBlueprint(usable, prompt);
}

export async function generateBlueprintUnified(prompt: string, provider: 'ollama' | 'gemini' = 'ollama', params?: any): Promise<Blueprint> {
  if (provider === 'gemini') {
    try { return await generateGeminiBlueprint(prompt, params); }
    catch (e:any) {
      const msg = e?.message || '';
      // cascade to ollama if available
      const healthy = await checkOllamaHealth();
      if (healthy) {
        try { return await generateOllamaBlueprint(prompt, params); }
        catch (ollErr:any) {
          // final emergency fallback
          return minimalBlueprint(prompt);
        }
      }
      // no healthy ollama
      return minimalBlueprint(prompt);
    }
  }
  // provider ollama
  try { return await generateOllamaBlueprint(prompt, params); }
  catch {
    return minimalBlueprint(prompt);
  }
}
