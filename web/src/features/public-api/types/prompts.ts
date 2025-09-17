import { z } from "zod/v4";
import { PromptSchema, queryStringZod } from "@langfuse/shared";

// PATCH /api/public/v2/prompts/{promptName}/versions/{promptVersion}
export const PatchPromptVersionV2Query = z
  .object({
    promptName: queryStringZod,
    promptVersion: z.coerce.number(),
  })
  .strict();

export const PatchPromptVersionV2Body = z
  .object({
    newLabels: z
      .array(z.string())
      .refine((labels) => !labels.includes("latest"), {
        message:
          "Label 'latest' is always assigned to the latest prompt version",
      }),
  })
  .strict();

export const PatchPromptVersionV2Response = PromptSchema;

// DELETE /api/public/v2/prompts/{promptName}/versions/{promptVersion}
export const DeletePromptVersionV2Query = z
  .object({
    promptName: queryStringZod,
    promptVersion: z.coerce.number(),
  })
  .strict();

export const DeletePromptVersionV2Response = z
  .object({
    message: z.string(),
  })
  .strict();
