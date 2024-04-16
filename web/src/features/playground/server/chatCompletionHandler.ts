import { StreamingTextResponse } from "ai";
import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

import { fetchLLMCompletion } from "@langfuse/shared";

import { PosthogCallbackHandler } from "./analytics/posthogCallback";
import {
  validateChatCompletionBody,
  type ValidatedChatCompletionBody,
} from "./validateChatCompletionBody";
import { getCookieName } from "@/src/server/utils/cookies";
import { env } from "@/src/env.mjs";

export default async function chatCompletionHandler(req: NextRequest) {
  const token = await getToken({
    req,
    cookieName: getCookieName("next-auth.session-token"),
    secret: env.NEXTAUTH_SECRET,
  });

  if (!token || !token.sub)
    // sub is the user id
    return NextResponse.json({ message: "Unauthenticated" }, { status: 401 });

  if (req.method !== "POST")
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );

  let body: ValidatedChatCompletionBody;

  try {
    body = validateChatCompletionBody(await req.json());
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        message: "Invalid request body",
        error: err,
      },
      { status: 400 },
    );
  }

  try {
    const { messages, modelParams } = body;
    const stream = await fetchLLMCompletion({
      messages,
      modelParams,
      streaming: true,
      callbacks: [new PosthogCallbackHandler("playground", body, token.sub)],
    });

    return new StreamingTextResponse(stream);
  } catch (err) {
    console.error(err);

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
