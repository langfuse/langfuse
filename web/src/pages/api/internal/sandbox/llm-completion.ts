import { z } from "zod";

import { InternalServerError, InvalidRequestError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  ChatMessageSchema,
  generateLLMText,
  getClientInitiatedNonStreamingLlmTimeoutMs,
  getLLMErrorInfo,
  LLMAdapter,
  LLMApiKeySchema,
  mapLegacyLLMCompletionParams,
} from "@langfuse/shared/src/server";

import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";

const SandboxLlmCompletionBody = z.object({
  provider: z.string().min(1),
  adapter: z.enum(LLMAdapter),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const SandboxLlmCompletionResponse = z.object({
  content: z.string(),
});

/**
 * Guest model calls. The sandbox credential authorizes `playground:execute`.
 * The provider connection stays on the server and the response is text only.
 */
export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Sandbox LLM completion",
    action: "playground:execute",
    bodySchema: SandboxLlmCompletionBody,
    responseSchema: SandboxLlmCompletionResponse,
    fn: async ({ body, auth }) => {
      const connection = await prisma.llmApiKeys.findFirst({
        where: {
          projectId: auth.scope.projectId,
          provider: body.provider,
        },
      });
      if (!connection) {
        throw new InvalidRequestError(
          `No ${body.provider} API key found in project. Please add one in the project settings.`,
        );
      }

      const parsedKey = LLMApiKeySchema.safeParse(connection);
      if (!parsedKey.success) {
        throw new InternalServerError(
          "Could not parse the project LLM connection",
        );
      }
      if (parsedKey.data.adapter !== body.adapter) {
        throw new InvalidRequestError(
          "Adapter does not match the project LLM connection",
        );
      }

      const messages = body.messages.map((message) =>
        ChatMessageSchema.parse(message),
      );

      try {
        const result = await generateLLMText({
          ...mapLegacyLLMCompletionParams({
            connection: parsedKey.data,
            messages,
            modelParams: {
              provider: parsedKey.data.provider,
              adapter: parsedKey.data.adapter,
              model: body.model,
              max_tokens: body.maxTokens,
              temperature: body.temperature,
            },
          }),
          timeout: getClientInitiatedNonStreamingLlmTimeoutMs(),
        });
        return { content: result.text };
      } catch (error) {
        const info = getLLMErrorInfo(error);
        if (!info) throw error;
        if (info.kind === "validation") {
          throw new InvalidRequestError(info.message);
        }
        throw new InternalServerError(info.message);
      }
    },
  }),
});
