import { z } from "zod/v4";
import { SkillFilePathSchema } from "./types";

export const MAX_SKILLS_PER_OBSERVATION = 100;

export const SkillsAvailableSchema = z
  .array(
    z.object({
      langfuseSkillId: z.string().min(1).max(256).nullish(),
      skillName: z.string().min(1).max(128),
      skillVersion: z.number().int().min(1).max(2_147_483_647).nullish(),
    }),
  )
  .max(MAX_SKILLS_PER_OBSERVATION);

export const SkillsAvailableInputSchema = z
  .array(
    z.union([
      z.object({
        name: SkillsAvailableSchema.element.shape.skillName,
        version: SkillsAvailableSchema.element.shape.skillVersion,
      }),
      z
        .object({
          skillName: SkillsAvailableSchema.element.shape.skillName,
          skillVersion: SkillsAvailableSchema.element.shape.skillVersion,
        })
        .transform(({ skillName, skillVersion }) => ({
          name: skillName,
          version: skillVersion,
        })),
    ]),
  )
  .max(MAX_SKILLS_PER_OBSERVATION);

export const SkillsResourceLoadedSchema = z
  .array(
    z.object({
      langfuseSkillId: z.string().min(1).max(256).nullish(),
      filePath: SkillFilePathSchema,
      skillName: z.string().min(1).max(128),
      skillVersion: z.number().int().min(1).max(2_147_483_647).nullish(),
    }),
  )
  .max(MAX_SKILLS_PER_OBSERVATION);

export type SkillsAvailableInput = z.infer<typeof SkillsAvailableInputSchema>;
export type SkillsAvailable = z.infer<typeof SkillsAvailableSchema>;
export type SkillsResourceLoaded = z.infer<typeof SkillsResourceLoadedSchema>;
