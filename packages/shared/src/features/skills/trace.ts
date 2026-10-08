import { z } from "zod/v4";
import { SkillFilePathSchema } from "./types";

export const SkillsAvailableSchema = z.array(
  z.object({
    langfuseSkillId: z.string().min(1).max(256).nullish(),
    skillName: z.string().min(1).max(128),
    langfuseSkillVersion: z.number().int().min(1).max(4_294_967_295).nullish(),
  }),
);

export const SkillsResourceLoadedSchema = z.array(
  z.object({
    langfuseSkillId: z.string().min(1).max(256).nullish(),
    filePath: SkillFilePathSchema,
    skillName: z.string().min(1).max(128),
    langfuseSkillVersion: z.number().int().min(1).max(4_294_967_295).nullish(),
  }),
);

export type SkillsAvailable = z.infer<typeof SkillsAvailableSchema>;
export type SkillsResourceLoaded = z.infer<typeof SkillsResourceLoadedSchema>;
