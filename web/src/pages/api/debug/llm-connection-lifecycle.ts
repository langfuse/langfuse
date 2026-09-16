import fs from "node:fs";
import { type NextApiRequest, type NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV !== "development" || req.method !== "POST") {
    res.status(404).end();
    return;
  }

  const { hypothesisId, location, message, data, timestamp } = req.body as {
    hypothesisId: string;
    location: string;
    message: string;
    data: Record<string, unknown>;
    timestamp: number;
  };

  // #region agent log
  fs.appendFileSync(
    "/opt/cursor/logs/debug.log",
    `${JSON.stringify({ hypothesisId, location, message, data, timestamp })}\n`,
  );
  // #endregion

  res.status(204).end();
}
