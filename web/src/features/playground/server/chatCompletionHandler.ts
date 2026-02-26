import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import {
  BaseError,
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMApiKeySchema,
  logger,
  fetchLLMCompletion,
  contextWithLangfuseProps,
} from "@langfuse/shared/src/server";
import * as opentelemetry from "@opentelemetry/api";

export default async function chatCompletionHandler(req: NextRequest) {
  try {
    const body = validateChatCompletionBody(await req.json());
    const { userId } = await authorizeRequestOrThrow(body.projectId);

    const blockedUsers = env.LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION;
    if (blockedUsers.has(userId)) {
      const reason = blockedUsers.get(userId);
      logger.warn("Blocked chat completion access", { userId, reason });
      throw new ForbiddenError("Access denied");
    }

    const baggageCtx = contextWithLangfuseProps({
      userId: userId,
      projectId: body.projectId,
    });

    return await opentelemetry.context.with(baggageCtx, async () => {
      const {
        messages,
        modelParams,
        tools,
        structuredOutputSchema,
        streaming,
      } = body;

      const LLMApiKey = await prisma.llmApiKeys.findFirst({
        where: {
          projectId: body.projectId,
          provider: modelParams.provider,
        },
      });

      if (!LLMApiKey)
        throw new InvalidRequestError(
          `No ${modelParams.provider} API key found in project. Please add one in the project settings.`,
        );

      const parsedKey = LLMApiKeySchema.safeParse(LLMApiKey);
      if (!parsedKey.success) {
        throw new InternalServerError(
          `Could not parse API key for provider ${body.modelParams.provider}: ${parsedKey.error.message}`,
        );
      }

      const fetchLLMCompletionParams = {
        llmConnection: parsedKey.data,
        messages,
        modelParams,
        structuredOutputSchema,
        callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      };

      if (structuredOutputSchema) {
        const result = await fetchLLMCompletion({
          ...fetchLLMCompletionParams,
          streaming: false,
          structuredOutputSchema,
        });
        return NextResponse.json(result);
      }

      // If messages contain tool results, we include tools in the request
      const hasToolResults = messages.some((msg) => msg.type === "tool-result");

      if ((tools && tools.length > 0) || hasToolResults) {
        // Fix empty tool_call_id values by mapping to langgraph IDs
        const fixedMessages = messages.map((msg) => {
          if (
            msg.type === "tool-result" &&
            (!msg.toolCallId || msg.toolCallId === "")
          ) {
            const assistantMessages = messages
              .filter((m) => m.type === "assistant-tool-call" && m.toolCalls)
              .reverse();

            // Find the first matching tool call by name
            // Note: using 'as any' because we filtered for assistant-tool-call messages above
            for (const prevMsg of assistantMessages) {
              const matchingToolCall = (prevMsg as any).toolCalls.find(
                (tc: any) => tc.name === (msg as any)._originalRole,
              );
              if (matchingToolCall && matchingToolCall.id) {
                return {
                  ...msg,
                  toolCallId: matchingToolCall.id,
                };
              }
            }
          }

          return msg;
        });

        const result = await (fetchLLMCompletion as any)({
          ...fetchLLMCompletionParams,
          messages: fixedMessages,
          streaming: false,
          tools: tools ?? [],
        });
        return NextResponse.json(result);
      }

      if (streaming) {
        const completion = await fetchLLMCompletion({
          ...fetchLLMCompletionParams,
          streaming,
        });

        return new StreamingTextResponse(completion);
      } else {
        const completion = await fetchLLMCompletion({
          ...fetchLLMCompletionParams,
          streaming,
        });

        if (typeof completion === "string") {
          return NextResponse.json({ content: completion });
        } else {
          return NextResponse.json({
            content: completion.text,
            reasoning: completion.reasoning,
          });
        }
      }
    });
  } catch (err) {
    logger.error("Failed to handle chat completion", err);

    if (err instanceof BaseError) {
      return NextResponse.json(
        {
          error: err.name,
          message: err.message,
        },
        { status: err.httpCode },
      );
    }

    if (err instanceof Error) {
      const statusCode =
        (err as any)?.response?.status ?? (err as any)?.status ?? 500;
      const errorMessage = err.message || "An unknown error occurred";

      return NextResponse.json(
        {
          message: errorMessage,
          error: err.name || "Error",
        },
        { status: statusCode },
      );
    }

    throw err;
  }
}
