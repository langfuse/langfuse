import { createHash, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { isBaseError } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import {
  handleSlackAgentRequest,
  SlackAgentRequest,
} from "@/src/features/slack-agent/server/service";

export const config = { api: { bodyParser: false } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }
  const secret = env.LANGFUSE_SLACK_AGENT_SECRET;
  const authorization = req.headers.authorization;
  if (!secret || !env.LANGFUSE_SLACK_TEAM_ID) {
    return res.status(404).json({ message: "Slack agent is not configured" });
  }
  if (
    typeof authorization !== "string" ||
    !timingSafeEqual(
      createHash("sha256").update(authorization).digest(),
      createHash("sha256").update(`Bearer ${secret}`).digest(),
    )
  ) {
    return res.status(401).json({ message: "Invalid bridge credentials" });
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > 48_000) {
        return res.status(413).json({ message: "Request is too large" });
      }
      chunks.push(buffer);
    }
    let json: unknown;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return res.status(400).json({ message: "Invalid JSON request" });
    }
    const input = SlackAgentRequest.safeParse(json);
    if (!input.success) {
      return res.status(400).json({ message: "Invalid Slack agent request" });
    }
    const result = await handleSlackAgentRequest(input.data);
    return res
      .status(input.data.operation === "start" ? 202 : 200)
      .json(result);
  } catch (error) {
    if (isBaseError(error) && error.isUserError()) {
      return res.status(error.httpCode).json({ message: error.message });
    }
    logger.error("Slack agent request failed", { error });
    return res.status(500).json({ message: "Slack agent request failed" });
  }
}
