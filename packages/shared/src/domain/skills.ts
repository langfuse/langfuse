import { z } from "zod";
import { jsonSchemaNullable } from "../utils/zod";

export const SkillDomainSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string(),
  description: z.string(),
  instructions: z.string(),
  metadata: jsonSchemaNullable,
  allowedTools: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  projectId: z.string(),
  commitMessage: z.string().nullable(),
});

export type SkillDomain = z.infer<typeof SkillDomainSchema>;
