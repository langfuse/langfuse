import { z } from "zod";
import type { Skill } from "@prisma/client";
import { jsonSchema } from "../../utils/zod";
import { COMMIT_MESSAGE_MAX_LENGTH } from "../prompts/constants";
import {
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_LABEL_MAX_LENGTH,
  SKILL_LABEL_REGEX,
  SKILL_LABEL_REGEX_ERROR,
} from "./constants";
import { SkillNameSchema } from "./validation";

export const SkillLabelSchema = z
  .string()
  .min(1)
  .max(SKILL_LABEL_MAX_LENGTH)
  .regex(SKILL_LABEL_REGEX, SKILL_LABEL_REGEX_ERROR);

/**
 * Create schema for skills. A skill mirrors a Claude Agent Skill (SKILL.md):
 * a name, a short description, an instructions body, optional metadata and a
 * list of allowed tools. Versioning and labels behave like prompts.
 */
export const CreateSkillSchema = z.object({
  name: SkillNameSchema,
  labels: z.array(SkillLabelSchema).default([]),
  description: z.string().max(SKILL_DESCRIPTION_MAX_LENGTH),
  instructions: z.string(),
  metadata: jsonSchema.nullable().default({}),
  allowedTools: z.array(z.string()).nullish(),
  tags: z.array(z.string()).nullish(),
  commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).nullish(),
});

export type CreateSkillType = z.infer<typeof CreateSkillSchema>;

// TRPC route requires projectId
export const CreateSkillTRPCSchema = CreateSkillSchema.extend({
  projectId: z.string(),
});

export type CreateSkillTRPCType = z.infer<typeof CreateSkillTRPCSchema>;

export const GetSkillsMetaSchema = z.object({
  name: z.string().optional(),
  version: z.coerce.number().int().nullish(),
  label: z.string().optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  fromUpdatedAt: z.iso.datetime({ offset: true }).nullish(),
  toUpdatedAt: z.iso.datetime({ offset: true }).nullish(),
});

export type GetSkillsMetaType = z.infer<typeof GetSkillsMetaSchema>;

export const GetSkillByNameSchema = z.object({
  skillName: z.string(),
  version: z.coerce.number().int().nullish(),
  label: z.string().optional(),
});

export const SkillSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  projectId: z.string(),
  createdBy: z.string(),
  version: z.number(),
  name: z.string(),
  labels: z.array(SkillLabelSchema),
  tags: z.array(z.string()),
  description: z.string(),
  instructions: z.string(),
  metadata: jsonSchema,
  allowedTools: z.array(z.string()),
  commitMessage: z.string().max(COMMIT_MESSAGE_MAX_LENGTH).nullish(),
});

export type ValidatedSkill =
  z.infer<typeof SkillSchema> extends Skill
    ? z.infer<typeof SkillSchema>
    : never;
