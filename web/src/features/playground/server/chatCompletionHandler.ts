import { StreamingTextResponse } from "ai";
import { type NextRequest, NextResponse } from "next/server";

import { validateChatCompletionBody } from "./validateChatCompletionBody";
import { fetchLLMCompletion } from "./fetchLLMCompletion";

export default async function chatCompletionHandler(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );
  }

  let body: ReturnType<typeof validateChatCompletionBody>;

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
