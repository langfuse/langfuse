import { z } from "zod";
import {
  SkillNameSchema,
  SKILL_DESCRIPTION_MAX_LENGTH,
  COMMIT_MESSAGE_MAX_LENGTH,
} from "@langfuse/shared";

export const NewSkillFormSchema = z.object({
  name: SkillNameSchema,
  description: z
    .string()
    .max(
      SKILL_DESCRIPTION_MAX_LENGTH,
      `Description must be at most ${SKILL_DESCRIPTION_MAX_LENGTH} characters`,
    ),
  instructions: z.string().min(1, "Enter the skill instructions"),
  // Metadata is edited as a JSON string in the form and parsed on submit.
  metadata: z.string().refine(validateJson, "Metadata needs to be valid JSON"),
  // Allowed tools are entered as a comma-separated string in the form.
  allowedTools: z.string(),
  isActive: z.boolean({
    error: "Enter whether the skill should go live",
  }),
  commitMessage: z
    .string()
    .trim()
    .max(COMMIT_MESSAGE_MAX_LENGTH)
    .transform((val) => (val === "" ? undefined : val))
    .optional(),
});

export type NewSkillFormSchemaType = z.infer<typeof NewSkillFormSchema>;

// Parse the comma-separated allowedTools field into a trimmed, de-duplicated list.
export function parseAllowedTools(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((tool) => tool.trim())
        .filter(Boolean),
    ),
  ];
}

function validateJson(content: string): boolean {
  try {
    JSON.parse(content);

    return true;
  } catch (_e) {
    return false;
  }
}
