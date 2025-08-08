import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1), // allow file: paths
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().min(1).default('deepseek-coder:6.7b'),
  GEMINI_MODEL: z.string().min(1).default('gemini-1.5-flash'),
  GEMINI_API_KEY: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(8), // allow shorter in dev, warn below if <16
  NEXTAUTH_URL: z.string().url().optional(),
});

const parsed = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
});

if (parsed.NEXTAUTH_SECRET.length < 16) {
  console.warn('[env] NEXTAUTH_SECRET is shorter than 16 chars (dev only). Use a longer random value for production security.');
}

export const env = parsed;