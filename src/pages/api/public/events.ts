import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 as uuidv4 } from "uuid";
import {
  EventSchema,
  eventTypes,
  ingestionBatch,
} from "@/src/features/public-api/server/ingestion-api-schema";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import { type z } from "zod";

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
    const convertToObservation = (generation: z.infer<typeof EventSchema>) => {
      return {
        ...generation,
        type: "EVENT",
      };
    };

    const event = {
      id: uuidv4(),
      type: eventTypes.OBSERVATION_CREATE,
      timestamp: new Date().toISOString(),
      body: convertToObservation(EventSchema.parse(req.body)),
    };

    const result = await handleBatch(
      ingestionBatch.parse([event]),
      req,
      authCheck,
    );
    handleBatchResultLegacy(result.errors, result.results, res);
  } catch (error: unknown) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      message: "Invalid request data",
      error: errorMessage,
    });
  }
}
