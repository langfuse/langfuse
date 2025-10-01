import { z } from "zod/v4";

export const CreateNaturalLanguageFilterCompletion = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(2048),
});

export type CreateNaturalLanguageFilterCompletionInput = z.infer<
  typeof CreateNaturalLanguageFilterCompletion
>;
