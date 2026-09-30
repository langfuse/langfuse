import { SkillVersionFileReferenceSchema } from "@langfuse/shared";
import { z } from "zod/v4";

export const GetSkillFileContentsBodySchema = z.object({
  sha256Hashes: z
    .array(SkillVersionFileReferenceSchema.shape.sha256Hash)
    .min(1)
    .max(50),
});

export const GetSkillFileContentsResponseSchema = z.object({
  data: z.array(
    z.object({
      sha256Hash: z.string(),
      content: z.string(),
    }),
  ),
});
