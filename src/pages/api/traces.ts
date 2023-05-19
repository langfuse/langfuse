import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TraceSchema = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.any()),
  status: z.string(),
  statusMessage: z.string().optional(),
});

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
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid request data",
      error: error.message,
    });
  }
}
