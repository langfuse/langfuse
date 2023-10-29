import { type NextApiRequest, type NextApiResponse } from "next";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { v4 as uuidv4 } from "uuid";
import { eventTypes } from "./ingestion-api-schema";
import { handleIngestionEvent } from "@/src/pages/api/public/ingestion";

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
      success: false,
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
    const event = {
      id: uuidv4(),
      type: eventTypes.EVENT_CREATE,
      body: req.body,
    };
    const response = await handleIngestionEvent(event, authCheck);
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
}
