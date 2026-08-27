import crypto from "node:crypto";
import { type NextApiRequest } from "next";

import { prisma } from "@langfuse/shared/src/db";
import {
  type ApiAccessLevel,
  type AuthHeaderValidVerificationResult,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { enforceProjectAuth } from "./enforcement.projects";
import { type ProjectAction } from "./types";

/** verifyAuth is the project route factory seam: the admin key short-circuits self-host, otherwise the new PDP authenticates, gates the action, and returns the resolved scope, throwing a `{ status, message }` on any denial. */
export async function verifyAuth(
  params: VerifyAuthParams,
): Promise<AuthHeaderValidVerificationResult> {
  if (params.isAdminApiKeyAuthAllowed) {
    const admin = await verifyAdminApiKeyAuth(params.req);
    if (admin) return admin;
  }

  const authz = await enforceProjectAuth({
    headers: params.req.headers,
    action: params.action ?? undefined,
    allowedAccessLevels: params.allowedAccessLevels,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: false,
  });
  if (!authz.success) {
    throw { status: authz.error.httpCode, message: authz.error.message };
  }
  return { validKey: true, scope: authz.scope };
}

/** verifyAdminApiKeyAuth authorizes a self-hosted admin key against a target project, returning null when the request is not an admin-key attempt. */
export async function verifyAdminApiKeyAuth(
  req: NextApiRequest,
): Promise<AuthHeaderValidVerificationResult | null> {
  const authHeader = req.headers.authorization;
  const adminApiKeyHeader = req.headers["x-langfuse-admin-api-key"];
  const projectIdHeader = req.headers["x-langfuse-project-id"];

  if (!authHeader?.startsWith("Bearer ") || !adminApiKeyHeader) return null;

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw {
      status: 403,
      message: "Admin API key auth is not available on Langfuse Cloud",
    };
  }

  const adminApiKey = env.ADMIN_API_KEY;
  if (!adminApiKey) {
    throw {
      status: 500,
      message: "Admin API key is not configured on this instance",
    };
  }

  const bearerToken = authHeader.replace("Bearer ", "");

  // Keep this comparison in sync with the admin-key check in
  // web/src/ee/features/admin-api/server/adminApiAuth.ts.
  try {
    const bearerTokenEqual = crypto.timingSafeEqual(
      Buffer.from(bearerToken),
      Buffer.from(adminApiKey),
    );
    const headerEqual = crypto.timingSafeEqual(
      Buffer.from(String(adminApiKeyHeader)),
      Buffer.from(adminApiKey),
    );
    if (!(bearerTokenEqual && headerEqual)) throw Error();
  } catch {
    throw { status: 401, message: "Invalid admin API key" };
  }

  if (!projectIdHeader || typeof projectIdHeader !== "string") {
    throw {
      status: 400,
      message:
        "x-langfuse-project-id header is required for admin API key authentication",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectIdHeader, deletedAt: null },
    select: { id: true, orgId: true },
  });
  if (!project) {
    throw { status: 404, message: "Project not found" };
  }

  return {
    validKey: true,
    scope: {
      projectId: project.id,
      accessLevel: "project",
      orgId: project.orgId,
      plan: "oss",
      rateLimitOverrides: [],
      apiKeyId: "ADMIN_API_KEY",
      publicKey: "ADMIN_API_KEY",
      isIngestionSuspended: false,
      isInAppAgentKey: false,
    },
  };
}

/** VerifyAuthParams is the request plus the route's action, accepted access levels, and key-kind opt-ins. */
export type VerifyAuthParams = {
  req: NextApiRequest;
  name: string;
  action: ProjectAction | null;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: ApiAccessLevel[];
  allowInAppAgentKey?: boolean;
};
