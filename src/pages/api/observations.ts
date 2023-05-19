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

/**
 * @swagger
 *  /api/observations:
 *   post:
 *     summary: Creates a new observation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               traceId:
 *                 type: string
 *                 description: The trace ID associated with the observation
 *               type:
 *                 type: string
 *                 enum: [span, event]
 *                 description: The type of the observation
 *               name:
 *                 type: string
 *                 description: The name of the observation
 *               startTime:
 *                 type: string
 *                 format: date-time
 *                 description: The start time of the observation
 *               endTime:
 *                 type: string
 *                 format: date-time
 *                 description: The end time of the observation
 *               attributes:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Attributes of the observation
 *               parentObservationId:
 *                 type: string
 *                 description: The parent observation ID associated with the observation
 *     responses:
 *       '201':
 *         description: Observation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 observation:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     traceId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     name:
 *                       type: string
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                     endTime:
 *                       type: string
 *                       format: date-time
 *                     attributes:
 *                       type: object
 *                       additionalProperties: true
 *                     parentObservationId:
 *                       type: string
 *       '400':
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 *       '405':
 *         description: Method not allowed
 */

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
