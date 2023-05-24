import { prisma } from "@/src/server/db";
import { ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { merge } from "lodash";

const LLMSpanCreateSchema = z.object({
  traceId: z.string(),
  name: z.string(),
  startTime: z.string().datetime(),
  attributes: z.object({
    prompt: z.string().optional(),
    completion: z.string().optional(),
    tokens: z
      .object({
        prompt: z.number().optional(),
        completion: z.number().optional(),
      })
      .optional(),
  }),
  parentObservationId: z.string().optional(),
});

const LLMSpanUpdateSchema = z.object({
  spanId: z.string(),
  endTime: z.string().datetime(),
  attributes: z.object({
    prompt: z.string().optional(),
    completion: z.string().optional(),
    tokens: z
      .object({
        prompt: z.number().optional(),
        completion: z.number().optional(),
      })
      .optional(),
  }),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST" && req.method !== "PATCH") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (req.method === "POST") {
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
  } else {
    try {
      const { spanId, endTime, attributes } = LLMSpanUpdateSchema.parse(
        req.body
      );

      const existingObservation = await prisma.observation.findUnique({
        where: { id: spanId },
      });

      if (!existingObservation) {
        return res.status(404).json({ message: "Span not found" });
      }

      const mergedAttributes = merge(
        existingObservation.attributes,
        attributes
      );

      const newObservation = await prisma.observation.update({
        where: { id: spanId },
        data: { endTime: new Date(endTime), attributes: mergedAttributes },
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
}
