import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import type { LLMAdapter } from "@langfuse/shared";
import { generateLLMText } from "@langfuse/shared/src/server/llm/llmText";
import type { AuthenticatedSdkGatewayExecution } from "./auth";

const ModelCompleteRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(32),
  maxOutputTokens: z.number().int().positive().max(2_048).optional(),
});

export async function completeSdkGatewayModelRequest(params: {
  execution: AuthenticatedSdkGatewayExecution;
  body: unknown;
}): Promise<{ text: string }> {
  const parsed = ModelCompleteRequestSchema.parse(params.body);
  const inputBytes = Buffer.byteLength(JSON.stringify(parsed), "utf8");
  if (inputBytes > params.execution.limits.modelInputBytes) {
    throw new Error("Model request exceeds the input size limit");
  }

  const execution = await prisma.inAppAgentScriptExecution.findUnique({
    where: {
      id_projectId: {
        id: params.execution.executionId,
        projectId: params.execution.projectId,
      },
    },
    select: { modelBinding: true },
  });

  const modelBinding =
    execution?.modelBinding &&
    typeof execution.modelBinding === "object" &&
    !Array.isArray(execution.modelBinding)
      ? (execution.modelBinding as {
          provider?: string;
          model?: string;
          llmApiKeyId?: string;
          adapter?: string;
        })
      : {};

  if (
    !modelBinding.llmApiKeyId ||
    !modelBinding.model ||
    !modelBinding.adapter
  ) {
    throw new Error(
      "No approved model binding is configured for this execution",
    );
  }

  const llmKey = await prisma.llmApiKeys.findFirst({
    where: {
      id: modelBinding.llmApiKeyId,
      projectId: params.execution.projectId,
    },
    select: {
      secretKey: true,
      extraHeaders: true,
      baseURL: true,
      config: true,
      adapter: true,
    },
  });

  if (!llmKey) {
    throw new Error("The approved model connection is no longer available");
  }

  const result = await generateLLMText({
    model: {
      adapter: llmKey.adapter as LLMAdapter,
      id: modelBinding.model,
    },
    connection: {
      secretKey: llmKey.secretKey,
      extraHeaders: llmKey.extraHeaders,
      baseURL: llmKey.baseURL,
      config: llmKey.config as never,
    },
    messages: parsed.messages,
    maxOutputTokens:
      parsed.maxOutputTokens ?? params.execution.limits.modelOutputTokens,
    maxRetries: 0,
  });

  return { text: result.text };
}
