import { safeJsonParse } from "@langfuse/shared";
import { InAppAgentQuestionnaireArgsSchema } from "@langfuse/shared/in-app-agent";

export function parseQuestionnaireQuestions(args: string) {
  const parsed = InAppAgentQuestionnaireArgsSchema.safeParse(
    safeJsonParse(args),
  );

  return parsed.success ? parsed.data.questions : null;
}
