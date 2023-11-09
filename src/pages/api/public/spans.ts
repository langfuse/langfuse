import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 } from "uuid";
import { RessourceNotFoundError } from "../../../utils/exceptions";
import {
  SpanPatchSchema,
  SpanPostSchema,
  eventTypes,
  ingestionApiSchema,
  ingestionBatch,
} from "./ingestion-api-schema";
import { handleBatch } from "@/src/pages/api/public/ingestion";
import { CreateSpanRequest } from "@/generated/typescript-server/serialization";
import { type z } from "zod";

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
      success: false,
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

      const convertToObservation = (span: z.infer<typeof SpanPostSchema>) => {
        return {
          ...span,
          id: span.id,
          type: "SPAN",
        };
      };

      const event = {
        id: v4(),
        type: eventTypes.OBSERVAION,
        body: convertToObservation(SpanPostSchema.parse(req.body)),
      };

      const response = await handleBatch(
        ingestionBatch.parse([event]),
        req,
        authCheck,
      );
      res.status(200).json(response);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      console.error(error, req.body);
      res.status(400).json({
        success: false,
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

      const convertToObservation = (span: z.infer<typeof SpanPatchSchema>) => {
        return {
          ...span,
          id: span.spanId,
          type: "SPAN",
        };
      };

      const event = {
        id: v4(),
        type: eventTypes.OBSERVAION,
        body: convertToObservation(SpanPatchSchema.parse(req.body)),
      };

      const response = await handleBatch(
        ingestionBatch.parse([event]),
        req,
        authCheck,
      );

      res.status(200).json(response);
    } catch (error: unknown) {
      console.error(error);

      if (error instanceof RessourceNotFoundError) {
        return res.status(404).json({
          success: false,
          message: "Span not found",
        });
      }
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      res.status(400).json({
        success: false,
        message: "Invalid request data",
        error: errorMessage,
      });
    }
  } else {
    res.status(405).json({ message: "Method not allowed" });
  }
}
