import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 } from "uuid";
import { ResourceNotFoundError } from "../../../utils/exceptions";
import {
  LegacySpanPatchSchema,
  LegacySpanPostSchema,
  eventTypes,
  ingestionBatchEvent,
} from "@langfuse/shared";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import { z } from "zod";
import { isPrismaException } from "@/src/utils/exceptions";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  await runMiddleware(req, res, cors);

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  if (req.method === "POST") {
    try {
      console.log(
        "Trying to generate span, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const convertToObservation = (
        span: z.infer<typeof LegacySpanPostSchema>,
      ) => {
        return {
          ...span,
          type: "SPAN",
        };
      };

      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_CREATE,
        timestamp: new Date().toISOString(),
        body: convertToObservation(LegacySpanPostSchema.parse(req.body)),
      };

      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        {},
        req,
        authCheck,
      );
      handleBatchResultLegacy(result.errors, result.results, res);
    } catch (error: unknown) {
      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      console.error(error, req.body);
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else if (req.method === "PATCH") {
    try {
      console.log(
        "Trying to update span, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const convertToObservation = (
        span: z.infer<typeof LegacySpanPatchSchema>,
      ) => {
        return {
          ...span,
          id: span.spanId,
          type: "SPAN",
        };
      };

      const event = {
        id: v4(),
        type: eventTypes.OBSERVATION_UPDATE,
        timestamp: new Date().toISOString(),
        body: convertToObservation(LegacySpanPatchSchema.parse(req.body)),
      };

      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        {},
        req,
        authCheck,
      );

      handleBatchResultLegacy(result.errors, result.results, res);
    } catch (error: unknown) {
      console.error(error);

      if (isPrismaException(error)) {
        return res.status(500).json({
          error: "Internal Server Error",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          error: error.errors,
        });
      }
      if (error instanceof ResourceNotFoundError) {
        return res.status(404).json({
          message: "Span not found",
        });
      }
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
}
