import { z } from "zod";

import {
  ChatMessageSchema,
  ForbiddenError,
  InvalidRequestError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMApiKeySchema,
  generateLLMText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  logger,
  mapLegacyLLMCompletionParams,
} from "@langfuse/shared/src/server";
import { isSandboxPublicKey } from "@langfuse/shared/in-app-agent/server/sandboxKey";

import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

const SandboxLlmCompletionBody = z.object({
  /** LLM connection name as configured in the project. */
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
});

const SandboxLlmCompletionResponse = z.object({
  completion: z.string(),
});

/**
 * Model calls for scripts running in the in-app agent sandbox. Not part of
 * the public API. The project's stored LLM connection is decrypted inside
 * `generateLLMText`; the guest only ever receives the completion text.
 */
export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Sandbox LLM completion",
    action: "playground:execute",
    bodySchema: SandboxLlmCompletionBody,
    responseSchema: SandboxLlmCompletionResponse,
    fn: async ({ body, auth }) => {
      if (!isSandboxPublicKey(auth.scope.publicKey)) {
        throw new ForbiddenError(
          "Only in-app agent sandbox keys can call this route",
        );
      }

      const projectId = auth.scope.projectId;
      const llmApiKey = await prisma.llmApiKeys.findFirst({
        where: { projectId, provider: body.provider },
      });
      const connection = LLMApiKeySchema.safeParse(llmApiKey);
      if (!connection.success) {
        throw new InvalidRequestError(
          `No LLM connection named ${body.provider} in this project`,
        );
      }

      try {
        const completion = await generateLLMText({
          ...mapLegacyLLMCompletionParams({
            connection: connection.data,
            messages: body.messages,
            modelParams: {
              provider: body.provider,
              adapter: connection.data.adapter,
              model: body.model,
              temperature: body.temperature,
              max_tokens: body.max_tokens,
            },
          }),
          timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
        });

        return { completion: completion.text };
      } catch (error) {
        // Provider errors can echo request details; keep them in server logs.
        logger.warn("Sandbox LLM completion failed", {
          error,
          projectId,
          provider: body.provider,
          model: body.model,
        });
        throw new ServiceUnavailableError("Model call failed");
      }
    },
  }),
});
