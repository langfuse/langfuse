import { appendFileSync } from "node:fs";
import type { NextApiRequest, NextApiResponse } from "next";

type DebugPayload = {
  hypothesisId?: unknown;
  location?: unknown;
  message?: unknown;
  data?: unknown;
  timestamp?: unknown;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const body: DebugPayload =
    typeof req.body === "object" && req.body !== null ? req.body : {};

  if (
    typeof body.hypothesisId !== "string" ||
    typeof body.location !== "string" ||
    typeof body.message !== "string" ||
    typeof body.timestamp !== "number"
  ) {
    res.status(400).json({ error: "Invalid debug payload" });
    return;
  }

  try {
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      JSON.stringify({
        hypothesisId: body.hypothesisId,
        location: body.location,
        message: body.message,
        data: body.data ?? {},
        timestamp: body.timestamp,
      }) + "\n",
    );
  } catch {
    // Keep onboarding flow functional when debug logging is unavailable.
  }

  res.status(204).end();
}
