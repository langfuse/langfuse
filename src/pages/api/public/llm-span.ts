import { prisma } from "@/src/server/db";
import { ObservationType, Prisma } from "@prisma/client";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { cors, runMiddleware } from "./cors";
import { merge } from "lodash";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/publicApi/server/apiAuth";
import { checkApiAccessScope } from "@/src/features/publicApi/server/apiScope";

const LLMSpanCreateSchema = z.object({
  traceId: z.string().nullish(),
  name: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().nullish(),
  attributes: z.object({
    prompt: z
      .array(z.object({ role: z.string(), content: z.string() }))
      .nullish(),
    completion: z.string().nullish(),
    tokens: z
      .object({
        promptAmount: z.number().nullish(),
        completionAmount: z.number().nullish(),
      })
      .nullish(),
    model: z.string().nullish(),
    temperature: z.number().nullish(),
    topP: z.number().nullish(),
    maxTokens: z.number().nullish(),
  }),
  parentObservationId: z.string().nullish(),
});

const LLMSpanUpdateSchema = z.object({
  spanId: z.string(),
  endTime: z.string().datetime(),
  attributes: z.object({
    prompt: z.string().nullish(),
    completion: z.string().nullish(),
    tokens: z
      .object({
        promptAmount: z.number().nullish(),
        completionAmount: z.number().nullish(),
      })
      .nullish(),
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

  if (req.method === "POST") {
    try {
      const {
        traceId,
        name,
        startTime,
        endTime,
        attributes,
        parentObservationId,
      } = LLMSpanCreateSchema.parse(req.body);

      console.log("attributes", attributes);

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        ...(traceId ? [{ type: "trace" as const, id: traceId }] : []),
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
          ...(traceId
            ? { trace: { connect: { id: traceId } } }
            : {
                trace: {
                  create: {
                    name: name,
                    attributes: Prisma.JsonNull,
                    project: { connect: { id: authCheck.scope.projectId } },
                  },
                },
              }),
          type: ObservationType.LLMCALL,
          name,
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : undefined,
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
  } else if (req.method === "PATCH") {
    try {
      const { spanId, endTime, attributes } = LLMSpanUpdateSchema.parse(
        req.body
      );

      // CHECK ACCESS SCOPE
      const accessCheck = await checkApiAccessScope(authCheck.scope, [
        { type: "observation", id: spanId },
      ]);
      if (!accessCheck)
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      // END CHECK ACCESS SCOPE

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
