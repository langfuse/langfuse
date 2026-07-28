import { NextResponse, type NextRequest } from "next/server";

import {
  BaseError,
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMApiKeySchema,
  createLLMOutput,
  createLLMToolSet,
  generateLLMText,
  getLLMErrorInfo,
  logger,
  contextWithLangfuseProps,
  mapLegacyLLMCompletionParams,
  streamLLMText,
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

      // If messages contain tool results, we include tools in the request
      const hasToolResults = messages.some((msg) => msg.type === "tool-result");
      // Fix empty tool_call_id values by mapping to langgraph IDs
      const fixedMessages =
        (tools && tools.length > 0) || hasToolResults
          ? messages.map((msg) => {
              if (
                msg.type === "tool-result" &&
                (!msg.toolCallId || msg.toolCallId === "")
              ) {
                const assistantMessages = messages
                  .filter(
                    (m) => m.type === "assistant-tool-call" && m.toolCalls,
                  )
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
            })
          : messages;

      const completionParams = mapLegacyLLMCompletionParams({
        connection: parsedKey.data,
        messages: fixedMessages,
        modelParams,
      });

      if (structuredOutputSchema) {
        const result = await generateLLMText({
          ...completionParams,
          output: createLLMOutput(structuredOutputSchema),
        });
        return NextResponse.json(result.output);
      }

      if ((tools && tools.length > 0) || hasToolResults) {
        const result = await generateLLMText({
          ...completionParams,
          tools: createLLMToolSet(tools ?? []),
        });
        return NextResponse.json({
          content: result.text,
          tool_calls: result.toolCalls.map((toolCall) => ({
            name: toolCall.toolName,
            id: toolCall.toolCallId,
            args:
              typeof toolCall.input === "object" &&
              toolCall.input !== null &&
              !Array.isArray(toolCall.input)
                ? toolCall.input
                : {},
          })),
          ...(result.finalStep.reasoningText
            ? { reasoning: result.finalStep.reasoningText }
            : {}),
        });
      }

      if (streaming) {
        const completion = await streamLLMText(completionParams);
        return new Response(
          completion.textStream.pipeThrough(new TextEncoderStream()),
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          },
        );
      }
      const completion = await generateLLMText(completionParams);
      return NextResponse.json({
        content: completion.text,
        ...(completion.finalStep.reasoningText
          ? { reasoning: completion.finalStep.reasoningText }
          : {}),
      });
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
      const llmError = getLLMErrorInfo(err);
      const statusCode = llmError?.statusCode ?? 500;
      const errorMessage = llmError?.message ?? "An internal error occurred";

      return NextResponse.json(
        {
          message: errorMessage,
          error: llmError ? err.name || "Error" : "InternalServerError",
        },
        { status: statusCode },
      );
    }

    throw err;
  }
}
