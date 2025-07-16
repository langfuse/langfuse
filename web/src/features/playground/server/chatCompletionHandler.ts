import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import {
  BaseError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import {
  LLMApiKeySchema,
  logger,
  fetchLLMCompletion,
  decryptAndParseExtraHeaders,
} from "@langfuse/shared/src/server";

export default async function chatCompletionHandler(req: NextRequest) {
  try {
    const body = validateChatCompletionBody(await req.json());
    const { userId } = await authorizeRequestOrThrow(body.projectId);

    const { messages, modelParams, tools, structuredOutputSchema, streaming } =
      body;

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
      messages,
      modelParams,
      structuredOutputSchema,
      callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      apiKey: decrypt(parsedKey.data.secretKey),
      extraHeaders: decryptAndParseExtraHeaders(parsedKey.data.extraHeaders),
      baseURL: parsedKey.data.baseURL || undefined,
      config: parsedKey.data.config,
    };

    if (structuredOutputSchema) {
      const result = await fetchLLMCompletion({
        ...fetchLLMCompletionParams,
        streaming: false,
        structuredOutputSchema,
      });
      return NextResponse.json(result.completion);
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
      return NextResponse.json(result.completion);
    }

    if (streaming) {
      const { completion } = await fetchLLMCompletion({
        ...fetchLLMCompletionParams,
        streaming,
      });

      return new StreamingTextResponse(completion);
    } else {
      const { completion } = await fetchLLMCompletion({
        ...fetchLLMCompletionParams,
        streaming,
      });

      return NextResponse.json({ content: completion });
    }
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
      return NextResponse.json(
        {
          message: err.message,
          error: err,
        },
        {
          status: (err as any)?.response?.status ?? (err as any)?.status ?? 500,
        },
      );
    }

    throw err;
  }
}
