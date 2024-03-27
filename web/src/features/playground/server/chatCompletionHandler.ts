import { StreamingTextResponse } from "ai";
import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

import { fetchLLMCompletion } from "@langfuse/shared/src/server/llm/fetchLLMCompletion";

import {
  validateChatCompletionBody,
  type ValidatedChatCompletionBody,
} from "./validateChatCompletionBody";
import { getCookieName } from "@/src/server/utils/cookies";

export default async function chatCompletionHandler(req: NextRequest) {
  const token = await getToken({
    req,
    cookieName: getCookieName("next-auth.session-token"),
  });

  if (!token)
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
    return NextResponse.json(
      {
        message: "Invalid request body",
        error: err,
      },
      { status: 400 },
    );
  }

  const { messages, modelParams } = body;
  const stream = await fetchLLMCompletion({
    messages,
    modelParams,
    streaming: true,
  });

  return new StreamingTextResponse(stream);
}
