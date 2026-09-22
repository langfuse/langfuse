import { hasProjectAccessByRole, type ProjectScope } from "@langfuse/shared";
import type { Role } from "@langfuse/shared/src/db";
import { eventTypes } from "@langfuse/shared/src/server";
import { SDK_GATEWAY_ROUTE_PREFIX } from "@langfuse/shared/in-app-agent";

export { SDK_GATEWAY_ROUTE_PREFIX };

export type SdkGatewayOperation =
  | "datasets.read"
  | "datasets.write"
  | "datasetRunItems.write"
  | "scores.write"
  | "telemetry.write"
  | "models.complete";

const OPERATION_SCOPES: Record<SdkGatewayOperation, ProjectScope[]> = {
  "datasets.read": ["datasets:read"],
  "datasets.write": ["datasets:CUD"],
  "datasetRunItems.write": ["promptExperiments:CUD", "datasets:CUD"],
  "scores.write": ["scores:CUD"],
  "telemetry.write": ["promptExperiments:CUD"],
  "models.complete": ["playground:execute"],
};

const ALLOWED_INGESTION_EVENT_TYPES = new Set<string>([
  eventTypes.SCORE_CREATE,
]);

const PROJECT_ID_KEYS = new Set(["projectId", "project_id"]);

export function resolveSdkGatewayOperation(params: {
  method: string;
  path: string;
}): SdkGatewayOperation | undefined {
  const method = params.method.toUpperCase();
  const path = normalizeGatewayPath(params.path);

  if (method === "POST" && path === "/models/complete") {
    return "models.complete";
  }

  if (method === "POST" && path === "/api/public/v2/datasets") {
    return "datasets.write";
  }

  if (method === "GET" && /^\/api\/public\/v2\/datasets\/[^/]+$/.test(path)) {
    return "datasets.read";
  }

  if (method === "POST" && path === "/api/public/dataset-items") {
    return "datasets.write";
  }

  if (method === "GET" && path === "/api/public/dataset-items") {
    return "datasets.read";
  }

  if (method === "POST" && path === "/api/public/dataset-run-items") {
    return "datasetRunItems.write";
  }

  if (method === "POST" && path === "/api/public/otel/v1/traces") {
    return "telemetry.write";
  }

  if (method === "POST" && path === "/api/public/ingestion") {
    return "telemetry.write";
  }

  return undefined;
}

export function authorizeSdkGatewayOperation(params: {
  operation: SdkGatewayOperation;
  projectRole: Role;
  isAdmin: boolean;
}): boolean {
  return OPERATION_SCOPES[params.operation].every((scope) =>
    hasProjectAccessByRole({
      role: params.projectRole,
      admin: params.isAdmin,
      scope,
    }),
  );
}

export function inspectIngestionBatch(batch: unknown[]): {
  allowed: boolean;
  eventCount: number;
  requiresScores: boolean;
  requiresTelemetry: boolean;
} {
  let requiresScores = false;
  let requiresTelemetry = false;

  for (const event of batch) {
    const type =
      event && typeof event === "object" && "type" in event
        ? String((event as { type?: unknown }).type ?? "")
        : "";

    if (!ALLOWED_INGESTION_EVENT_TYPES.has(type)) {
      return {
        allowed: false,
        eventCount: batch.length,
        requiresScores,
        requiresTelemetry,
      };
    }

    if (type === eventTypes.SCORE_CREATE) {
      requiresScores = true;
    } else {
      requiresTelemetry = true;
    }
  }

  return {
    allowed: true,
    eventCount: batch.length,
    requiresScores,
    requiresTelemetry,
  };
}

export function normalizeGatewayPath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  const stripped = withoutQuery.startsWith(SDK_GATEWAY_ROUTE_PREFIX)
    ? withoutQuery.slice(SDK_GATEWAY_ROUTE_PREFIX.length)
    : withoutQuery;
  const withLeadingSlash = stripped.startsWith("/") ? stripped : `/${stripped}`;
  return withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

export function containsForeignProjectId(
  value: unknown,
  projectId: string,
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForeignProjectId(entry, projectId));
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (
      PROJECT_ID_KEYS.has(key) &&
      typeof entry === "string" &&
      entry.length > 0 &&
      entry !== projectId
    ) {
      return true;
    }

    if (containsForeignProjectId(entry, projectId)) {
      return true;
    }
  }

  return false;
}
