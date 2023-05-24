import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { prisma } from "@/src/server/db";

const CreateTraceSchema = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.any()),
  status: z.enum(["success", "error", "executing"]),
  statusMessage: z.string().optional(),
});

const UpdateTraceSchema = z.object({
  id: z.string(),
  status: z.enum(["success", "error", "executing"]),
  statusMessage: z.string().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  await runMiddleware(req, res, cors);

  if (req.method !== "POST" && req.method !== "PATCH") {
    console.log(req.method, req.body);
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (req.method === "POST") {
    try {
      const { name, attributes, status, statusMessage } =
        CreateTraceSchema.parse(req.body);

      const newTrace = await prisma.trace.create({
        data: {
          timestamp: new Date(),
          name,
          attributes,
          status,
          statusMessage,
        },
      });

      res.status(201).json(newTrace);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "PATCH") {
    try {
      const { id, status, statusMessage } = UpdateTraceSchema.parse(req.body);

      const updatedTrace = await prisma.trace.update({
        where: {
          id,
        },
        data: {
          status,
          statusMessage,
        },
      });

      res.status(201).json(updatedTrace);
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
