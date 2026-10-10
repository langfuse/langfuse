import { z } from "zod";
import {
  ForbiddenError,
  InternalServerError,
  LangfuseNotFoundError,
  UnauthorizedError,
  safeJsonParse,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsV2FromEventsTableForPublicApi,
  getTraceByIdFromEventsTable,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ContextResolver } from "@/src/features/auth/policy/contextResolver";
import { clampToDataAccessDays } from "@/src/features/entitlements/server/hasEntitlementLimit";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { toApiAccessScope } from "@/src/features/public-api/server/toApiAccessScope";
import { buildTraceExportFromTrace } from "@/src/features/traces/server/buildTraceExport";
import { signHmacSha256, verifyHmacSha256 } from "@/src/server/utils/hmac";
import { getProductBaseUrl } from "@/src/utils/base-url";
import type { ServerContext } from "../../types";

const DOWNLOAD_TTL_MS = 5 * 60 * 1000;
const SIGNING_PREFIX = "langfuse:mcp-json-download:v1:";
const DownloadClaimsSchema = z.object({
  projectId: z.string().min(1),
  apiKeyId: z.string().min(1),
  traceId: z.string().min(1),
  observationId: z.string().min(1).optional(),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
});
export async function createExportDownload(
  resource: { traceId: string } | { observationId: string },
  context: ServerContext,
) {
  const traceId = await resolveTraceId(resource, context.projectId);
  const observationId =
    "observationId" in resource ? resource.observationId : undefined;
  await getExportTrace({ traceId, projectId: context.projectId }, context.plan);
  const { claims, downloadUrl } = createDownloadLink(
    { traceId, observationId },
    context,
  );
  await auditLog({
    resourceType: observationId ? "observation" : "trace",
    resourceId: observationId ?? traceId,
    action: "download",
    apiKeyId: context.apiKeyId,
    orgId: context.orgId,
    projectId: context.projectId,
  });

  return {
    downloadUrl,
    filename: downloadFilename(claims),
    mimeType: "application/json",
    expiresAt: new Date(claims.expiresAt).toISOString(),
  };
}

export function readDownloadToken(token: unknown): DownloadClaims {
  const invalidToken = () =>
    new UnauthorizedError("Invalid or expired download link");
  if (typeof token !== "string" || token.length > 8192) throw invalidToken();
  const parts = token.split(".");
  if (parts.length !== 2) throw invalidToken();
  const [payload, signature] = parts;
  if (
    !verifyHmacSha256({
      message: SIGNING_PREFIX + payload,
      signature,
      secrets: [signingSecret()],
    })
  ) {
    throw invalidToken();
  }
  const parsed = DownloadClaimsSchema.safeParse(
    safeJsonParse(Buffer.from(payload, "base64url").toString("utf8")),
  );
  if (!parsed.success) throw invalidToken();
  const { issuedAt, expiresAt } = parsed.data;
  if (
    issuedAt > Date.now() ||
    expiresAt <= Date.now() ||
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > DOWNLOAD_TTL_MS
  ) {
    throw invalidToken();
  }
  return parsed.data;
}

export async function authorizeExportDownload(claims: DownloadClaims) {
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      id: claims.apiKeyId,
      projectId: claims.projectId,
      scope: "PROJECT",
      project: { deletedAt: null },
    },
  });
  if (!apiKey || isApiKeyExpired(apiKey.expiresAt)) {
    throw new UnauthorizedError("Download API key is no longer valid");
  }
  const resolved = await new ContextResolver().resolve({
    authorization: "privateKey",
    apiKey,
  });
  if (!resolved.success) throw resolved.error;
  const { principal } = resolved.context;
  if (
    principal.kind !== "apiKey" ||
    !principal.organizations.some((org) =>
      org.projectIds.includes(claims.projectId),
    )
  ) {
    throw new UnauthorizedError("Download project is no longer available");
  }
  const decision = shadowAuthorize({
    ctx: env.API_AUTH_MIGRATION === "legacy" ? undefined : resolved.context,
    action: "traces:read",
    resource: { projectId: claims.projectId },
    legacyDecision: { success: true, scope: { accessLevel: "project" } },
  });
  if (!decision.success) throw decision.error;
  const scope = toApiAccessScope(principal, {
    orgId: principal.boundResource.orgId,
    projectId: claims.projectId,
  });
  if (scope.isIngestionSuspended) {
    throw new ForbiddenError("Access suspended: Usage threshold exceeded.");
  }
  return scope;
}

export async function buildExportDownload(
  claims: DownloadClaims,
  plan: ServerContext["plan"],
) {
  const trace = await getExportTrace(claims, plan);
  const payload = await buildTraceExportFromTrace({
    trace,
    projectId: claims.projectId,
  });
  if (!claims.observationId) return payload;

  const observations = payload.observations.filter(
    (observation) => observation.id === claims.observationId,
  );
  if (observations.length === 0) {
    throw new LangfuseNotFoundError(
      "Observation is not included in the trace JSON export. It may have been deleted or exceed the trace's observation limit.",
    );
  }
  return {
    observations,
    scores: payload.scores.filter(
      (score) => score.observationId === claims.observationId,
    ),
  };
}

export function downloadFilename(claims: DownloadClaims) {
  return claims.observationId
    ? `observation-${claims.observationId}.json`
    : `trace-${claims.traceId}.json`;
}

async function resolveTraceId(
  resource: { traceId: string } | { observationId: string },
  projectId: string,
) {
  if (!("observationId" in resource)) return resource.traceId;

  const observations = await getObservationsV2FromEventsTableForPublicApi({
    projectId,
    page: 0,
    limit: 1,
    fields: ["core"],
    advancedFilters: [
      {
        type: "string",
        column: "id",
        operator: "=",
        value: resource.observationId,
      },
    ],
  });
  const observation = observations.find(
    (item) => item.id === resource.observationId,
  );
  if (!observation?.traceId) {
    throw new LangfuseNotFoundError("Observation not found");
  }
  return observation.traceId;
}

function createDownloadLink(
  resource: Pick<DownloadClaims, "traceId" | "observationId">,
  context: Pick<ServerContext, "projectId" | "apiKeyId">,
) {
  const issuedAt = Date.now();
  const claims: DownloadClaims = {
    projectId: context.projectId,
    apiKeyId: context.apiKeyId,
    traceId: resource.traceId,
    observationId: resource.observationId,
    issuedAt,
    expiresAt: issuedAt + DOWNLOAD_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = signHmacSha256(SIGNING_PREFIX + payload, signingSecret());
  const url = new URL("api/mcp/download", getProductBaseUrl());
  url.searchParams.set("token", `${payload}.${signature}`);

  return { claims, downloadUrl: url.toString() };
}

function signingSecret() {
  if (!env.NEXTAUTH_SECRET) {
    throw new InternalServerError(
      "NEXTAUTH_SECRET must be configured for MCP downloads",
    );
  }
  return env.NEXTAUTH_SECRET;
}

async function getExportTrace(
  resource: { traceId: string; projectId: string },
  plan: ServerContext["plan"],
) {
  const trace = await getTraceByIdFromEventsTable({
    traceId: resource.traceId,
    projectId: resource.projectId,
    renderingProps: { truncated: true, shouldJsonParse: false },
  });
  if (!trace) throw new LangfuseNotFoundError("Trace not found");
  const { accessFloor } = clampToDataAccessDays({ plan });
  if (accessFloor && trace.timestamp < accessFloor) {
    throw new ForbiddenError("Trace is outside the plan's data access window");
  }
  return trace;
}

type DownloadClaims = z.infer<typeof DownloadClaimsSchema>;
