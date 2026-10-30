import { type NextApiRequest, type NextApiResponse } from "next";
import getRawBody from "raw-body";

import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

import {
  getConductorOneJwks,
  verifyConductorOneRequest,
} from "./conductorOneAuth";
import {
  C1_TEST_EVENT,
  parseConductorOneEnvelope,
  parseProvisionPayload,
} from "./conductorOnePayload";
import {
  provisionSupportAccess,
  type ProvisionResult,
} from "./provisionSupportAccess";

function toC1Response(result: ProvisionResult) {
  const comment = { comment: result.message };
  return result.ok
    ? { version: "v1", complete: comment }
    : { version: "v1", errored: comment };
}

// C1 retries any non-2xx, so rejected requests answer 200 with `errored`.
export async function conductorOneWebhookHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const issuer = env.LANGFUSE_CONDUCTORONE_ISSUER;
  const entitlementId = env.LANGFUSE_CONDUCTORONE_ENTITLEMENT_ID;
  const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
  if (!issuer || !entitlementId || !isCloud || !env.NEXTAUTH_URL) {
    return res.status(404).json({ error: "Not found" });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Requires `bodyParser: false` on the route: the JWT signs the raw body's hash.
  let rawBody: Buffer;
  try {
    rawBody = await getRawBody(req, {
      length: req.headers["content-length"],
      limit: "1mb",
    });
  } catch {
    return res.status(413).json({ error: "Payload too large" });
  }

  try {
    await verifyConductorOneRequest({
      authorization: req.headers.authorization ?? null,
      rawBody,
      issuer,
      audience: new URL(env.NEXTAUTH_URL).hostname,
      jwks: getConductorOneJwks(issuer),
    });
  } catch (error) {
    logger.warn("ConductorOne webhook rejected", {
      reason: (error as Error).message,
    });
    return res.status(401).json({ error: "Unauthorized" });
  }

  const envelope = parseConductorOneEnvelope(rawBody);
  if (envelope?.event === C1_TEST_EVENT) {
    return res.status(200).json({ version: "v1" });
  }

  const request = envelope ? parseProvisionPayload(envelope.payload) : null;
  if (!request) {
    logger.warn("ConductorOne webhook unrecognized payload");
    const result = { ok: false, message: "Unrecognized webhook payload" };
    return res.status(200).json(toC1Response(result));
  }

  try {
    const result = await provisionSupportAccess(request, entitlementId);
    if (!result.ok) {
      logger.warn("ConductorOne provisioning rejected", {
        reason: result.message,
        action: request.action,
        c1TaskId: request.taskId,
      });
    }
    return res.status(200).json(toC1Response(result));
  } catch (error) {
    logger.error("ConductorOne provisioning failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
