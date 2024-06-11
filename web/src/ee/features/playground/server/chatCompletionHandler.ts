import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import {
  BaseError,
  ValidationError,
  fetchLLMCompletion,
} from "@langfuse/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";

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
      throw new ValidationError(
        `No ${modelParams.provider} API key found in project. Please add one in the project settings.`,
      );

    const stream = await fetchLLMCompletion({
      messages,
      modelParams,
      streaming: true,
      callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      apiKey: decrypt(LLMApiKey.secretKey),
      baseURL: LLMApiKey.baseURL || undefined,
    });

    return new StreamingTextResponse(stream);
  } catch (err) {
    console.error(err);

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
        { status: 500 },
      );
    }

    throw err;
  }
}
