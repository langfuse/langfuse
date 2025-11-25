import { z } from "zod/v4";
import { jsonSchemaNullable } from "../utils/zod";

export const PromptDomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
  isActive: z.boolean().nullable(),
  type: z.string().default("text"),
  tags: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  prompt: jsonSchemaNullable,
  config: jsonSchemaNullable,
  projectId: z.string(),
  commitMessage: z.string().nullable(),
});

export type PromptDomain = z.infer<typeof PromptDomainSchema>;
