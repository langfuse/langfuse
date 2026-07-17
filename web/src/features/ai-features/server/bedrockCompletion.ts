import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import {
  type ChatMessage,
  generateLLMText,
  LLMAdapter,
  mapLegacyLLMCompletionParams,
  type TraceSinkParams,
} from "@langfuse/shared/src/server";
import { randomBytes } from "crypto";

import { env } from "@/src/env.mjs";

export function isLangfuseAITracingConfigured() {
  return Boolean(env.LANGFUSE_AI_FEATURES_PROJECT_ID);
}

export function getLangfuseAITraceSinkParams(params: {
  environment: TraceSinkParams["environment"];
  feature: string;
  projectId: string;
  traceId?: string;
  traceName: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  prompt?: TraceSinkParams["prompt"];
}): TraceSinkParams | undefined {
  if (!env.LANGFUSE_AI_FEATURES_PROJECT_ID) {
    return undefined;
  }

  return {
    environment: params.environment,
    traceName: params.traceName,
    traceId: params.traceId ?? randomBytes(16).toString("hex"),
    targetProjectId: env.LANGFUSE_AI_FEATURES_PROJECT_ID,
    userId: params.userId,
    metadata: {
      langfuse_ai_feature: params.feature,
      langfuse_project_id: params.projectId,
      ...params.metadata,
    },
    prompt: params.prompt,
  };
}

export async function generateLangfuseAIText(params: {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  traceSinkParams?: TraceSinkParams;
}): Promise<string> {
  const model = params.model ?? env.LANGFUSE_AWS_BEDROCK_MODEL;

  if (!model) {
    throw new Error("Langfuse AI completion model is not configured.");
  }

  const result = await generateLLMText({
    ...mapLegacyLLMCompletionParams({
      messages: params.messages,
      modelParams: {
        provider: "bedrock",
        adapter: LLMAdapter.Bedrock,
        model,
        // Intentionally omit temperature/top_p: newer Bedrock models reject these
        // inference params, while AI-feature generation works at model defaults.
        ...(params.maxTokens !== undefined
          ? { max_tokens: params.maxTokens }
          : {}),
      },
      connection: {
        secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
      },
      credentialSource: "langfuse",
    }),
    trace: params.traceSinkParams,
  });

  return result.text;
}
