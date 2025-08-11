import { z } from 'zod';

// Core extracted domain elements
export const EntitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    optional: z.boolean().optional(),
    description: z.string().optional(),
  })).default([]),
  relations: z.array(z.object({
    type: z.enum(['one-to-one','one-to-many','many-to-one','many-to-many']).optional(),
    target: z.string(),
    field: z.string().optional(),
    inverse: z.string().optional(),
    description: z.string().optional(),
  })).default([])
});

export const RoleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([])
});

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  entities: z.array(z.string()).default([]),
  actions: z.array(z.object({
    verb: z.string(),
    target: z.string().optional(),
    description: z.string().optional()
  })).default([])
});

export const RouteSchema = z.object({
  path: z.string(),
  method: z.string().optional(),
  type: z.enum(['page','api']).default('page'),
  auth: z.boolean().optional(),
  description: z.string().optional(),
  featureIds: z.array(z.string()).default([]),
  dynamicParams: z.array(z.string()).default([])
});

export const ComponentSchema = z.object({
  name: z.string(),
  kind: z.enum(['layout','page','ui','feature']).default('ui'),
  routePath: z.string().optional(),
  featureId: z.string().optional(),
  purpose: z.string().optional(),
  dependsOn: z.array(z.string()).default([])
});

export const ApiContractSchema = z.object({
  route: z.string(),
  method: z.enum(['GET','POST','PUT','DELETE','PATCH']).default('GET'),
  name: z.string().optional(),
  description: z.string().optional(),
  request: z.object({
    query: z.array(z.object({ name:z.string(), type:z.string().optional() })).default([]),
    bodyFields: z.array(z.object({ name:z.string(), type:z.string().optional(), required:z.boolean().optional() })).default([])
  }).default({}),
  response: z.object({
    fields: z.array(z.object({ name:z.string(), type:z.string().optional() })).default([])
  }).default({}),
  featureId: z.string().optional()
});

export const PrismaModelSchema = z.object({
  name: z.string(),
  definition: z.string(),
  fromEntity: z.string().optional()
});

export const DependencySchema = z.object({
  from: z.string(),
  to: z.string(),
  reason: z.string().optional()
});

export const PlanV2Schema = z.object({
  meta: z.object({
    appName: z.string().optional(),
    summary: z.string().optional(),
    stack: z.array(z.string()).default([])
  }).default({ stack: [] }),
  roles: z.array(RoleSchema).default([]),
  entities: z.array(EntitySchema).default([]),
  features: z.array(FeatureSchema).default([]),
  routes: z.array(RouteSchema).default([]),
  components: z.array(ComponentSchema).default([]),
  apiContracts: z.array(ApiContractSchema).default([]),
  prismaModels: z.array(PrismaModelSchema).default([]),
  dependencies: z.array(DependencySchema).default([]),
  warnings: z.array(z.string()).default([])
});

export type PlanV2 = z.infer<typeof PlanV2Schema>;

export function emptyPlan(): PlanV2 { return { meta:{ stack:[] }, roles:[], entities:[], features:[], routes:[], components:[], apiContracts:[], prismaModels:[], dependencies:[], warnings:[] }; }
