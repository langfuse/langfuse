import { SkillVersionFileReferenceSchema } from "@langfuse/shared";
import { z } from "zod/v4";

export const GetSkillFileContentsInputSchema = z.object({
  sha256Hashes: z
    .array(SkillVersionFileReferenceSchema.shape.sha256Hash)
    .min(1)
    .max(50),
});

export const GetSkillFileContentsQuerySchema =
  GetSkillFileContentsInputSchema.extend({
    sha256Hashes: z
      .string()
      .transform((value) => value.split(","))
      .pipe(GetSkillFileContentsInputSchema.shape.sha256Hashes),
  });

export const GetSkillFileContentsResponseSchema = z.object({
  data: z.array(
    z.object({
      sha256Hash: z.string(),
      content: z.string(),
    }),
  ),
});
