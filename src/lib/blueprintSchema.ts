import { z } from 'zod';

export const componentSchema = z.object({
  name: z.string(),
  props: z.record(z.string(), z.string().optional()).optional(),
  code: z.string(),
});

export const pageSchema = z.object({
  route: z.string(),
  title: z.string().optional(),
  components: z.array(z.string()).default([]),
  code: z.string(),
});

export const apiRouteSchema = z.object({
  route: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  code: z.string(),
});

export const prismaModelSchema = z.object({
  name: z.string(),
  definition: z.string(),
});

export const blueprintSchema = z.object({
  version: z.number().int().min(1).default(1),
  name: z.string(),
  description: z.string().optional(),
  pages: z.array(pageSchema),
  components: z.array(componentSchema),
  apiRoutes: z.array(apiRouteSchema),
  prismaModels: z.array(prismaModelSchema).optional(),
});

export type Blueprint = z.infer<typeof blueprintSchema>;
