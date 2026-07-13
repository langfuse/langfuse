import { z } from "zod";

export const CreateNaturalLanguageFilterCompletion = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(2048),
});

export type CreateNaturalLanguageFilterCompletionInput = z.infer<
  typeof CreateNaturalLanguageFilterCompletion
>;
