import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

import {
  getConductorOneJwks,
  verifyConductorOneRequest,
} from "./conductorOneAuth";
import {
  C1_PROVISION_EVENT,
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
export async function conductorOneWebhookHandler(req: NextRequest) {
  const issuer = env.LANGFUSE_CONDUCTORONE_ISSUER;
  const entitlementId = env.LANGFUSE_CONDUCTORONE_ENTITLEMENT_ID;
  const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
  if (!issuer || !entitlementId || !isCloud || !env.NEXTAUTH_URL) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Raw bytes: the JWT signs their hash.
  const rawBody = Buffer.from(await req.arrayBuffer());
  try {
    await verifyConductorOneRequest({
      authorization: req.headers.get("authorization"),
      rawBody,
      issuer,
      audience: new URL(env.NEXTAUTH_URL).hostname,
      jwks: getConductorOneJwks(issuer),
    });
  } catch (error) {
    logger.warn("ConductorOne webhook rejected", {
      reason: (error as Error).message,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envelope = parseConductorOneEnvelope(rawBody);
  if (envelope?.event === C1_TEST_EVENT) {
    return NextResponse.json({ version: "v1" });
  }
  if (envelope?.event !== C1_PROVISION_EVENT) {
    logger.warn("ConductorOne webhook unsupported event", {
      event: envelope?.event,
    });
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }

  const request = parseProvisionPayload(envelope.payload);
  if (!request) {
    logger.warn("ConductorOne webhook unrecognized provisioning payload");
    const result = { ok: false, message: "Unrecognized provisioning payload" };
    return NextResponse.json(toC1Response(result));
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
    return NextResponse.json(toC1Response(result));
  } catch (error) {
    logger.error("ConductorOne provisioning failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
