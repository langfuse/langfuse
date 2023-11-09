import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 as uuidv4 } from "uuid";
import { RessourceNotFoundError } from "../../../utils/exceptions";
import {
  GenerationPatchSchema,
  GenerationsCreateSchema,
  eventTypes,
  ingestionBatch,
} from "./ingestion-api-schema";
import { handleBatch } from "@/src/pages/api/public/ingestion";
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
        "trying to create observation for generation, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const convertToObservation = (
        generation: z.infer<typeof GenerationsCreateSchema>,
      ) => {
        return {
          ...generation,
          type: "GENERATION",
        };
      };

      const event = {
        id: uuidv4(),
        type: eventTypes.OBSERVAION,
        body: convertToObservation(GenerationsCreateSchema.parse(req.body)),
      };

      const response = await handleBatch(
        ingestionBatch.parse([event]),
        req,
        authCheck,
      );

      res.status(200).json(response);
    } catch (error: unknown) {
      console.error(error);
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
      console.log(
        "trying to update observation for generation, project ",
        authCheck.scope.projectId,
        ", body:",
        JSON.stringify(req.body, null, 2),
      );

      const convertToObservation = (
        generation: z.infer<typeof GenerationPatchSchema>,
      ) => {
        return {
          ...generation,
          id: generation.generationId,
          type: "GENERATION",
        };
      };

      const event = {
        id: uuidv4(),
        type: eventTypes.OBSERVAION,
        body: convertToObservation(GenerationPatchSchema.parse(req.body)),
      };

      const response = await handleBatch(
        ingestionBatch.parse(event),
        req,
        authCheck,
      );
      res.status(200).json(response);
    } catch (error: unknown) {
      console.error(error);

      if (error instanceof RessourceNotFoundError) {
        return res.status(404).json({
          success: false,
          message: "Observation not found",
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
    return res.status(405).json({ message: "Method not allowed" });
  }
}
