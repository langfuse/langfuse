import { safeJsonParse } from "@langfuse/shared";
import { InAppAgentQuestionnaireResultSchema } from "@langfuse/shared/in-app-agent";

export function parseQuestionnaireToolResult(result: string | undefined) {
  if (result === undefined) {
    return null;
  }

  const parsed = InAppAgentQuestionnaireResultSchema.safeParse(
    safeJsonParse(result),
  );

  return parsed.success ? parsed.data : null;
}
