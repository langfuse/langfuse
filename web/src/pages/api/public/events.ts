import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 as uuidv4 } from "uuid";
import {
  CreateEventEvent,
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

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  // CHECK AUTH
  const authCheck = await verifyAuthHeaderAndReturnScope(
    req.headers.authorization,
  );
  if (!authCheck.validKey)
    return res.status(401).json({
      message: authCheck.error,
    });
  // END CHECK AUTH

  console.log(
    "trying to create observation for event, project ",
    authCheck.scope.projectId,
    ", body:",
    JSON.stringify(req.body, null, 2),
  );

  try {
    const convertToObservation = (
      generation: z.infer<typeof CreateEventEvent>,
    ) => {
      return {
        ...generation,
        type: "EVENT",
      };
    };

    const event = {
      id: uuidv4(),
      type: eventTypes.OBSERVATION_CREATE,
      timestamp: new Date().toISOString(),
      body: convertToObservation(CreateEventEvent.parse(req.body)),
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
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid request data",
        error: error.errors,
      });
    }
    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
