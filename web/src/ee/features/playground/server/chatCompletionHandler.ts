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

    const { messages, modelParams } = body;

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

    const { completion } = await fetchLLMCompletion({
      messages,
      modelParams,
      streaming: true,
      callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      apiKey: decrypt(parsedKey.data.secretKey),
      extraHeaders: decryptAndParseExtraHeaders(parsedKey.data.extraHeaders),
      baseURL: parsedKey.data.baseURL || undefined,
      config: parsedKey.data.config,
    });

    return new StreamingTextResponse(completion);
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
