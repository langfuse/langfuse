import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import Cors from "cors";

const prisma = new PrismaClient();

const TraceSchema = z.object({
  name: z.string(),
  attributes: z.record(z.string(), z.any()),
  status: z.literal("success").or(z.literal("error")).or(z.literal("running")),
  statusMessage: z.string().optional(),
});

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
) {
  console.log("runMiddleware", req, res, fn);
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const cors = Cors({
    origin: ["http://localhost:3000"],
    //update: or "origin: true," if you don't wanna add a specific one
    credentials: true,
  });

  await runMiddleware(req, res, cors);

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
