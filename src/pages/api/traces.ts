import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TraceSchema = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.any()),
  status: z.literal("success").or(z.literal("error")).or(z.literal("running")),
  statusMessage: z.string().optional(),
});

/**
 * @swagger
 * /api/traces:
 *     post:
 *       summary: Creates a new trace
 *       requestBody:
 *         required: true
 *         content:
 *          application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   description: The name of the trace
 *                 attributes:
 *                   type: object
 *                   additionalProperties: true
 *                   description: Attributes of the trace
 *                 status:
 *                   type: string
 *                   enum: [success, error, running]
 *                   description: The status of the trace
 *                 statusMessage:
 *                   type: string
 *                   description: A status message
 *       responses:
 *         '201':
 *           description: Trace created successfully
 *           content:
 *             application/json:
 *              schema:
 *                 type: object
 *                   trace:
 *                     type: object
 *                     properties:
 *                 properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       attributes:
 *                         type: object
 *                         additionalProperties: true
 *                       status:
 *                         type: string
 *                       statusMessage:
 *                         type: string
 *         '400':
 *           description: Invalid request data
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success:
 *                     type: boolean
 *                   message:
 *                     type: string
 *                   error:
 *                     type: string
 *         '405':
 *           description: Method not allowed
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { name, attributes, status, statusMessage } = TraceSchema.parse(
      req.body
    );

    const newTrace = await prisma.trace.create({
      data: {
        timestamp: new Date(),
        name,
        attributes,
        status,
        statusMessage,
      },
    });

    res.status(201).json({ trace: newTrace });
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
