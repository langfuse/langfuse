import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import {
  BaseError,
  ForbiddenError,
  InternalServerError,
  InvalidRequestError,
} from "@langfuse/shared";

import { authorizeRequestOrThrow } from "@/src/features/playground/server/authorizeRequest";
import { MetaPromptCompletionBodySchema } from "./validation";
import { buildMetaPromptMessages } from "./buildMetaPromptMessages";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  LLMApiKeySchema,
  logger,
  fetchLLMCompletion,
} from "@langfuse/shared/src/server";

export default async function metaPromptCompletionHandler(req: NextRequest) {
  try {
    const body = MetaPromptCompletionBodySchema.parse(await req.json());
    const { userId } = await authorizeRequestOrThrow(body.projectId);

    const blockedUsers = env.LANGFUSE_BLOCKED_USERIDS_CHATCOMPLETION;
    if (blockedUsers.has(userId)) {
      const reason = blockedUsers.get(userId);
      logger.warn("Blocked meta prompt completion access", { userId, reason });
      throw new ForbiddenError("Access denied");
    }

    const { messages, modelParams, targetPlatform, streaming } = body;

    // 1. Look up API key
    const LLMApiKey = await prisma.llmApiKeys.findFirst({
      where: {
        projectId: body.projectId,
        provider: modelParams.provider,
      },
    });

    if (!LLMApiKey) {
      throw new InvalidRequestError(
        `No ${modelParams.provider} API key found in project. Please add one in the project settings.`,
      );
    }

    const parsedKey = LLMApiKeySchema.safeParse(LLMApiKey);
    if (!parsedKey.success) {
      throw new InternalServerError(
        `Could not parse API key for provider ${modelParams.provider}: ${parsedKey.error.message}`,
      );
    }

    // 2. Inject meta prompt system prompt
    const fullMessages = buildMetaPromptMessages({
      userMessages: messages,
      targetPlatform,
    });

    // 3. Call LLM
    const fetchParams = {
      llmConnection: parsedKey.data,
      messages: fullMessages,
      modelParams,
    };

    if (streaming) {
      const stream = await fetchLLMCompletion({
        ...fetchParams,
        streaming: true,
      });
      return new StreamingTextResponse(stream);
    } else {
      const completion = await fetchLLMCompletion({
        ...fetchParams,
        streaming: false,
      });
      return NextResponse.json({ content: completion });
    }
  } catch (err) {
    logger.error("Failed to handle meta prompt completion", err);

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
        (
          err as unknown as Record<string, unknown> & {
            response?: { status?: number };
          }
        )?.response?.status ??
        (err as unknown as Record<string, unknown> & { status?: number })
          ?.status ??
        500;
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
