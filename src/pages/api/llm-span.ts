import { prisma } from "@/src/server/db";
import { ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";

const SpanPostSchema = z.object({
  traceId: z.string(),
  name: z.string(),
  startTime: z.string().datetime(),
  attributes: z.record(z.string(), z.any()),
  parentObservationId: z.string().optional(),
});

const LLMSpanCreateSchema = z.object({
  traceId: z.string(),
  name: z.string(),
  startTime: z.string().datetime(),
  attributes: z.object({
    prompt: z.string().optional(),
    completion: z.string().optional(),
    tokens: z.object({
      prompt: z.number().optional(),
      completion: z.number().optional(),
    }),
  }),
  parentObservationId: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { traceId, name, startTime, attributes, parentObservationId } =
      LLMSpanCreateSchema.parse(req.body);

    const newObservation = await prisma.observation.create({
      data: {
        trace: { connect: { id: traceId } },
        type: ObservationType.LLMCALL,
        name,
        startTime: new Date(startTime),
        attributes,
        parent: parentObservationId
          ? { connect: { id: parentObservationId } }
          : undefined,
      },
    });

    res.status(201).json(newObservation);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      success: false,
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
