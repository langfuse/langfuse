import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  ChatMessageRole,
  ChatMessageType,
  generateLangfuseAIText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  logger,
} from "@langfuse/shared/src/server";

import { resolveLangfuseAiFeatureAvailability } from "@/src/features/ai-features/server";

/** Generates a concise monitor name when Langfuse AI features are available. */
export async function suggestMonitorName({
  prisma,
  projectId,
  description,
}: {
  prisma: PrismaClient;
  projectId: string;
  description: string;
}): Promise<string | null> {
  const availability = await resolveLangfuseAiFeatureAvailability({
    prisma,
    projectId,
  });
  if (!availability.available) return null;

  try {
    const generated = await generateLangfuseAIText({
      messages: [
        {
          role: ChatMessageRole.System,
          content:
            "Return only a concise alert title of at most six words. Describe what is monitored and the trigger. Do not use quotes or punctuation at the end.",
          type: ChatMessageType.System,
        },
        {
          role: ChatMessageRole.User,
          content: description,
          type: ChatMessageType.User,
        },
      ],
      model: availability.model,
      maxTokens: 40,
      timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
    });
    return (
      generated
        ?.trim()
        .replace(/^['"]|['"]$/g, "")
        .slice(0, 200) || null
    );
  } catch (error) {
    logger.warn("Alert title generation failed", { projectId, error });
    return null;
  }
}
