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

const SpanPatchSchema = z.object({
  spanId: z.string(),
  endTime: z.string().datetime(),
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
        SpanPostSchema.parse(req.body);

      const newObservation = await prisma.observation.create({
        data: {
          trace: { connect: { id: traceId } },
          type: ObservationType.SPAN,
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
      const { spanId, endTime } = SpanPatchSchema.parse(req.body);

      const newObservation = await prisma.observation.update({
        where: { id: spanId },
        data: { endTime: new Date(endTime) },
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
