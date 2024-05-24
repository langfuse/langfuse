import { StreamingTextResponse } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/src/env.mjs";
import { BaseError, fetchLLMCompletion } from "@langfuse/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import { validateChatCompletionBody } from "./validateChatCompletionBody";

export default async function chatCompletionHandler(req: NextRequest) {
  try {
    const body = validateChatCompletionBody(await req.json());
    const { userId } = await authorizeRequestOrThrow(body.projectId);

    const { messages, modelParams } = body;
    const stream = await fetchLLMCompletion({
      messages,
      modelParams,
      streaming: true,
      callbacks: [new PosthogCallbackHandler("playground", body, userId)],
      apiKey:
        modelParams.provider === "openai"
          ? env.OPENAI_API_KEY
          : env.ANTHROPIC_API_KEY,
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
