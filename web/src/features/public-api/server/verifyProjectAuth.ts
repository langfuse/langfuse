import { type NextApiRequest } from "next";

import { type AuthHeaderValidVerificationResult } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { env } from "@/src/env.mjs";
import {
  verifyAuth as verifyLegacyAuth,
  type RouteAccessLevel,
} from "@/src/features/public-api/server/verifyProjectApiKeyAuth";
import {
  enforceProjectAuth,
  type ProjectAccessResult,
} from "@/src/features/auth/policy/enforceProjectAuth";
import {
  diffResults,
  legacyFromStatus,
  recordCoverage,
} from "@/src/features/auth/policy/shadow";
import {
  type Principal,
  type ProjectAction,
} from "@/src/features/auth/policy/types";

/** verifyProjectAuth is the project seam: the new pipeline decides alone in enforce, both run for parity in shadow (byte-identical to legacy), and legacy decides alone otherwise (the default). */
export async function verifyProjectAuth(
  params: VerifyAuthParams,
): Promise<VerifyAuthResult> {
  // enforce mode runs only the new pipeline, which is the sole authority.
  if (env.API_AUTH_MIGRATION === "enforce") {
    const authz = await runNewAuth(params);
    if (!authz.success) {
      throw { status: authz.error.httpCode, message: authz.error.message };
    }
    return toVerifyAuthResult(authz);
  }

  // shadow mode runs both: legacy decides, the new pipeline records parity.
  if (env.API_AUTH_MIGRATION === "shadow") {
    const legacy = await runLegacyAuth(params);
    const authz = await runNewAuth(params);
    recordCoverage(params.name);
    diffResults(authz, legacyFromStatus(legacy.status), {
      seam: "project_route",
      action: params.action,
    });
    if (!legacy.ok) throw legacy.error;
    return legacy.auth;
  }

  // legacy is the default: any other value (including a blank one) fails safe
  // to the legacy path, so self-host does no new auth work.
  const legacy = await runLegacyAuth(params);
  if (!legacy.ok) throw legacy.error;
  return legacy.auth;
}

/** runLegacyAuth runs the legacy verify and captures its throw as a value with the status it reported. */
async function runLegacyAuth(
  params: VerifyAuthParams,
): Promise<LegacyDecision> {
  try {
    const auth = await verifyLegacyAuth(
      params.req,
      params.isAdminApiKeyAuthAllowed ?? false,
      params.allowedAccessLevels ?? ["project"],
      params.allowInAppAgentKey ?? false,
    );
    return { ok: true, status: 200, auth };
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    return {
      ok: false,
      status: typeof status === "number" ? status : 500,
      error,
    };
  }
}

/** runNewAuth runs the new project pipeline for the request's action and route opt-ins. */
function runNewAuth(params: VerifyAuthParams) {
  return enforceProjectAuth({
    headers: params.req.headers,
    action: params.action,
    allowInAppAgentKey: params.allowInAppAgentKey,
    isAdminApiKeyAuthAllowed: params.isAdminApiKeyAuthAllowed,
  });
}

/** toVerifyAuthResult maps the new pipeline's principal to the legacy-shaped verified scope. */
async function toVerifyAuthResult(
  authz: ProjectAccessResult,
): Promise<VerifyAuthResult> {
  const { principal } = authz.context;
  if (principal.kind === "admin") return adminScope(authz.projectId);
  if (principal.kind !== "apiKey") {
    throw {
      status: 500,
      message: `unexpected principal kind on the project seam: ${principal.kind}`,
    };
  }
  return apiKeyScope(principal, authz.projectId);
}

/** apiKeyScope maps an api-key principal to its verified scope; an org key here is an invariant break. */
function apiKeyScope(
  principal: ApiKeyPrincipal,
  projectId: string,
): VerifyAuthResult {
  // The project seam denies org keys at the PDP, so one reaching here means a
  // project route granted an org-satisfiable action.
  if (principal.scope !== "PROJECT") {
    throw {
      status: 500,
      message: `org-scoped key ${principal.apiKeyId} reached the project mapper`,
    };
  }
  const org = principal.organizations[0];
  if (!org) {
    throw {
      status: 500,
      message: `api key ${principal.apiKeyId} resolved to no organization`,
    };
  }
  return {
    validKey: true,
    scope: {
      projectId,
      accessLevel:
        principal.presentation === "publicKey" ? "scores" : "project",
      orgId: org.orgId,
      plan: org.plan,
      rateLimitOverrides: org.rateLimitOverrides,
      apiKeyId: principal.apiKeyId,
      publicKey: principal.publicKey,
      isIngestionSuspended: org.isIngestionSuspended,
      isInAppAgentKey: principal.isInAppAgentKey,
    },
  };
}

/** adminScope synthesizes the legacy self-host admin scope, loading the target project's org (404 on miss); admin key auth never applies on Langfuse Cloud. */
async function adminScope(projectId: string): Promise<VerifyAuthResult> {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw {
      status: 403,
      message: "Admin API key auth is not available on Langfuse Cloud",
    };
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { id: true, orgId: true },
  });
  if (!project) throw { status: 404, message: "Project not found" };
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

/** VerifyAuthParams is the request plus the route's action and legacy auth options. */
export type VerifyAuthParams = {
  req: NextApiRequest;
  name: string;
  action: ProjectAction;
  isAdminApiKeyAuthAllowed?: boolean;
  allowedAccessLevels?: RouteAccessLevel[];
  allowInAppAgentKey?: boolean;
};

/** VerifyAuthResult is the verified project scope the route handler receives. */
export type VerifyAuthResult = AuthHeaderValidVerificationResult & {
  scope: { projectId: string; accessLevel: RouteAccessLevel };
};

/** ApiKeyPrincipal is the api-key variant of `Principal` the mapper consumes. */
type ApiKeyPrincipal = Extract<Principal, { kind: "apiKey" }>;

/** LegacyDecision is the legacy verify captured as a value: the verified scope, or the status + error to re-throw. */
type LegacyDecision =
  | { ok: true; status: 200; auth: VerifyAuthResult }
  | { ok: false; status: number; error: unknown };
