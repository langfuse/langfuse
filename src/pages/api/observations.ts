import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ObservationSchema = z.object({
  traceId: z.string(),
  type: z.literal("span").or(z.literal("event")),
  name: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attributes: z.record(z.string(), z.any()),
  parentObservationId: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const {
      traceId,
      type,
      name,
      startTime,
      endTime,
      attributes,
      parentObservationId,
    } = ObservationSchema.parse(req.body);

    const newObservation = await prisma.observation.create({
      data: {
        trace: { connect: { id: traceId } },
        type,
        name,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attributes,
        parent: parentObservationId
          ? { connect: { id: parentObservationId } }
          : undefined,
      },
    });

    res.status(201).json({ success: true, observation: newObservation });
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
