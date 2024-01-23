import {
  availableModelSchema,
  availableModes,
  availableProviderSchema,
} from "@/src/features/playground/types";
import { Client, neonConfig } from "@neondatabase/serverless";
import { OpenAIStream, StreamingTextResponse } from "ai";
import OpenAI from "openai";
import { z } from "zod";

// TODO: use Prisma Client when supported in NextJS edge runtime
// (@see https://github.com/prisma/prisma/issues/21394)
// (@see https://github.com/prisma/prisma/issues/18763)

export const runtime = "edge";

const PLAYGROUND_API_DAILY_LIMIT_DEFAULT = 100;

if (!process.env.VERCEL_ENV) {
  // Set the WebSocket proxy to work with the local instance
  neonConfig.wsProxy = (host) => `${host}:5433/v1`;
  // Disable all authentication and encryption
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const requestSchema = z.object({
  playgroundHistoryId: z.string(),
  projectId: z.string(),
  keyId: z.string().optional(),
  mode: z.enum(availableModes),
  model: availableModelSchema,
  provider: availableProviderSchema,
  parameters: z.record(z.number()),
  messages: z
    .array(
      z.object({
        role: z.union([
          z.literal("system"),
          z.literal("user"),
          z.literal("assistant"),
        ]),
        content: z.string(),
      }),
    )
    .optional(),
  prompt: z.string().optional(),
});

const dayTotalSchema = z.object({
  rows: z.array(z.object({ count: z.string() })),
});

export default async function handler(req: Request) {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();

  const body = requestSchema.parse(await req.json());

  try {
    const dayTotal = dayTotalSchema.parse(
      await client.query(
        "SELECT COUNT(*) FROM playground_histories WHERE project_id = $1 AND key_id IS NULL AND created_at >= NOW() - INTERVAL '24 HOUR'",
        [body.projectId],
      ),
    );
    const row = dayTotal.rows.at(0);
    if (
      row &&
      Number(row.count) >
        Number(
          process.env.PLAYGROUND_API_DAILY_LIMIT ??
            PLAYGROUND_API_DAILY_LIMIT_DEFAULT,
        )
    ) {
      throw new Error("Usage limit reached");
    }

    let response;
    if (body.mode === "chat") {
      if (!body.messages) {
        throw new Error("Messages not provided for chat completion");
      }

      // Exclude additional fields from being sent to OpenAI
      const openAiMessages = body.messages.map(({ role, content }) => ({
        role,
        content,
      }));

      response = await openai.chat.completions.create({
        ...body.parameters,
        model: body.model,
        stream: true,
        messages: openAiMessages,
      });
    } else {
      // body.mode === 'completion'
      if (!body.prompt) {
        throw new Error("Prompt not provided for completion");
      }

      response = await openai.completions.create({
        ...body.parameters,
        model: body.model,
        stream: true,
        prompt: body.prompt,
      });
    }

    const stream = OpenAIStream(response, {
      async onFinal(completion) {
        await client.query(
          "UPDATE playground_histories SET output = $1, status = $2, updated_at = $3 WHERE (id = $4 AND project_id = $5)",
          [
            { completion },
            "completed",
            new Date(),
            body.playgroundHistoryId,
            body.projectId,
          ],
        );
      },
    });
    return new StreamingTextResponse(stream, {
      headers: {
        "X-Mode": body.mode,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      await client.query(
        "UPDATE playground_histories SET output = $1, status = $2, updated_at = $3 WHERE (id = $4 AND project_id = $5)",
        [
          { error: error.message },
          "error",
          new Date(),
          body.playgroundHistoryId,
          body.projectId,
        ],
      );
    }

    throw error;
  }
}
