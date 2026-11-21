import { planLabels, type Plan, type RateLimitResult } from "@langfuse/shared";
import { getCurrentSpan, logger } from "@langfuse/shared/src/server";

import type { GatewayApiKeyAuthContext } from "@/src/features/ai-gateway/server/auth/gatewayApiKeyAuthenticator";
import { GatewayControlPlaneError } from "@/src/features/ai-gateway/server/gatewayControlPlaneError";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

type GatewayRateLimitDimension = "requests" | "bytes";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export class GatewayRateLimitError extends GatewayControlPlaneError {
  constructor(
    message: string,
    readonly limit: GatewayRateLimitDimension,
    readonly retryAfterSeconds: number,
    readonly organizationId: string,
  ) {
    super(message, 429, "rate_limit_exceeded");
  }
}

/**
 * Counts one request and its body bytes against the organization's per-minute
 * AI Gateway limits. Fails open like every other RateLimitService caller:
 * self-hosted, disabled rate limits, or an unavailable Redis never reject.
 */
export async function enforceGatewayRateLimits({
  context,
  requestBytes,
}: {
  context: GatewayApiKeyAuthContext;
  requestBytes: number;
}) {
  const scope = {
    orgId: context.organizationId,
    projectId: context.ingestionProjectId,
    accessLevel: "organization" as const,
    plan: context.plan,
    rateLimitOverrides: context.rateLimitOverrides,
    apiKeyId: context.apiKeyId,
    publicKey: context.apiKeyId,
    isIngestionSuspended: false,
    accessAuditLogEnabled: null,
  };
  const service = RateLimitService.getInstance();
  const [requests, bytes] = await Promise.all([
    service.rateLimitRequest(scope, "ai-gateway-requests"),
    service.rateLimitRequest(scope, "ai-gateway-request-bytes", requestBytes),
  ]);

  const exceeded = (
    [
      { limit: "requests", helper: requests },
      { limit: "bytes", helper: bytes },
    ] as const
  )
    .flatMap(({ limit, helper }) =>
      helper.isRateLimited() && helper.res ? [{ limit, res: helper.res }] : [],
    )
    // Retrying before the later window resets would hit the other limit.
    .toSorted((a, b) => b.res.msBeforeNext - a.res.msBeforeNext)[0];
  if (!exceeded) return;

  const { limit, res } = exceeded;
  const retryAfterSeconds = Math.max(1, Math.ceil(res.msBeforeNext / 1000));
  logger.warn("AI Gateway rate limit exceeded", {
    orgId: context.organizationId,
    projectId: context.ingestionProjectId,
    apiKeyId: context.apiKeyId,
    plan: context.plan,
    limit,
    current: res.consumedPoints,
    limitValue: res.points,
    requestBytes,
    retryAfterSeconds,
  });
  getCurrentSpan()?.setAttributes({
    "langfuse.ai_gateway.rate_limited": true,
    "langfuse.ai_gateway.rate_limit.limit": limit,
  });
  const override = context.rateLimitOverrides.find(
    (override) => override.resource === res.resource,
  );
  throw new GatewayRateLimitError(
    gatewayRateLimitMessage({
      limit,
      res,
      plan: context.plan,
      retryAfterSeconds,
      hasOverride: Boolean(override),
      windowSeconds: override?.durationInSec ?? 60,
    }),
    limit,
    retryAfterSeconds,
    context.organizationId,
  );
}

function gatewayRateLimitMessage(params: {
  limit: GatewayRateLimitDimension;
  res: RateLimitResult;
  plan: Plan;
  retryAfterSeconds: number;
  hasOverride: boolean;
  windowSeconds: number;
}) {
  const window = formatWindow(params.windowSeconds);
  const allowance =
    params.limit === "requests"
      ? `${params.res.points.toLocaleString("en-US")} requests per ${window}`
      : `${formatBytes(params.res.points)} of request bodies per ${window}`;
  const subject = params.hasOverride
    ? "your organization's custom limit allows"
    : `your organization's ${planLabels[params.plan]} plan allows`;
  const remedy =
    params.plan === "cloud:enterprise" || params.hasOverride
      ? "contact Langfuse support to raise the limit"
      : "upgrade your plan";
  return `Langfuse AI Gateway rate limit exceeded: ${subject} ${allowance}. Retry after ${params.retryAfterSeconds}s or ${remedy}.`;
}

function formatBytes(bytes: number) {
  return bytes >= GiB && bytes % GiB === 0
    ? `${bytes / GiB} GiB`
    : `${Math.round((bytes / MiB) * 10) / 10} MiB`;
}

const windowUnits = [
  { seconds: 86_400, name: "day" },
  { seconds: 3_600, name: "hour" },
  { seconds: 60, name: "minute" },
] as const;

function formatWindow(seconds: number) {
  for (const unit of windowUnits) {
    if (seconds % unit.seconds !== 0) continue;
    const count = seconds / unit.seconds;
    return count === 1 ? unit.name : `${count} ${unit.name}s`;
  }
  return seconds === 1 ? "second" : `${seconds} seconds`;
}
