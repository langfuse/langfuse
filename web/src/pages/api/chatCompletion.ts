import { OpenAIStream, StreamingTextResponse } from "ai";
import OpenAI from "openai";
import { z } from "zod";

import {
  ChatMessageRole,
  SupportedModel,
} from "@/src/components/playground/types";
import { type NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

const chatCompletionInput = z.object({
  messages: z.array(
    z.object({
      role: z.nativeEnum(ChatMessageRole),
      content: z.string(),
    }),
  ),
  modelParams: z.object({
    model: z.nativeEnum(SupportedModel),
    temperature: z.number(),
  }),
});

export default async function handler(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );
  }

  const body = (await req.json()) as unknown;
  const input = chatCompletionInput.parse(body);
  const { messages, modelParams } = input;
  const openaiModel = modelParams.model.replace("openai-", "");

  const response = await openai.chat.completions.create({
    model: openaiModel,
    temperature: modelParams.temperature,
    messages,
    stream: true,
  });

  const stream = OpenAIStream(response);

  return new StreamingTextResponse(stream);
}
