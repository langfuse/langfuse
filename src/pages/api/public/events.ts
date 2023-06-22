import { prisma } from "@/src/server/db";
import { ObservationType } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const ObservationSchema = z.object({
  traceId: z.string(),
  name: z.string(),
  startTime: z.string().datetime(),
  metadata: z.record(z.string(), z.any()),
  input: z.record(z.string(), z.any()).nullish(),
  output: z.record(z.string(), z.any()).nullish(),
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

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      success: false,
      message: authCheck.error,
    });
  // END CHECK AUTH

  try {
    const {
      traceId,
      name,
      startTime,
      metadata,
      input,
      output,
      parentObservationId,
    } = ObservationSchema.parse(req.body);

    // CHECK ACCESS SCOPE
    const accessCheck = await checkApiAccessScope(authCheck.scope, [
      { type: "trace", id: traceId },
      ...(parentObservationId
        ? [{ type: "observation" as const, id: parentObservationId }]
        : []),
    ]);
    if (!accessCheck)
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    // END CHECK ACCESS SCOPE

    const newObservation = await prisma.observation.create({
      data: {
        trace: { connect: { id: traceId } },
        type: ObservationType.EVENT,
        name,
        startTime: new Date(startTime),
        metadata,
        input: input ?? undefined,
        output: output ?? undefined,
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
