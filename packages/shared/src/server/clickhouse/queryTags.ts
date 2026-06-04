import * as opentelemetry from "@opentelemetry/api";

export const CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION = "1" as const;

export const CLICKHOUSE_QUERY_SURFACES = [
  "trpc",
  "public-api",
  "batch-export",
  "worker",
  "custom-query",
  "internal",
] as const;

export type ClickHouseQuerySurface = (typeof CLICKHOUSE_QUERY_SURFACES)[number];

export const CLICKHOUSE_QUERY_STORAGES = [
  "events",
  "legacy",
  "mixed",
  "unknown",
] as const;

export type ClickHouseQueryStorage = (typeof CLICKHOUSE_QUERY_STORAGES)[number];

export const CLICKHOUSE_QUERY_WORKLOADS = [
  "list",
  "count",
  "lookup",
  "aggregate",
  "filter-options",
  "export",
  "batch-io",
  "write",
  "delete",
] as const;

export type ClickHouseQueryWorkload =
  (typeof CLICKHOUSE_QUERY_WORKLOADS)[number];

export const CLICKHOUSE_QUERY_SERVICES = ["web", "worker", "shared"] as const;

export type ClickHouseQueryService = (typeof CLICKHOUSE_QUERY_SERVICES)[number];

export const CLICKHOUSE_QUERY_FEATURES = [
  "background-migration",
  "batch-add-to-dataset",
  "batch-eval",
  "batch-export",
  "clickhouse-record-verification",
  "custom-queries",
  "data-deletion",
  "data-retention",
  "health",
  "ingestion",
  "tracing",
] as const;

export type ClickHouseQueryFeature =
  | (typeof CLICKHOUSE_QUERY_FEATURES)[number]
  | (string & {});

export const CLICKHOUSE_QUERY_ENTITIES = [
  "blob-storage-file-log",
  "clickhouse-metadata",
  "dataset",
  "dataset-run-item",
  "event",
  "observation",
  "score",
  "session",
  "trace",
  "unknown",
] as const;

export type ClickHouseQueryEntity =
  | (typeof CLICKHOUSE_QUERY_ENTITIES)[number]
  | (string & {});

export const CLICKHOUSE_QUERY_PHYSICAL_TABLES = [
  "blob_storage_file_log",
  "dataset_run_items_rmt",
  "events",
  "events_core",
  "events_full",
  "observations",
  "observations_batch_staging",
  "scores",
  "traces",
  "traces_null",
] as const;

export type ClickHouseQueryPhysicalTable =
  | (typeof CLICKHOUSE_QUERY_PHYSICAL_TABLES)[number]
  | "multiple"
  | (string & {});

export type NormalizedClickHouseQueryTags = {
  tag_schema_version: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  surface: ClickHouseQuerySurface;
  feature: ClickHouseQueryFeature;
  entity: ClickHouseQueryEntity;
  storage: ClickHouseQueryStorage;
  workload: ClickHouseQueryWorkload;
  project_id: string | "multiple" | "none" | "unknown";
  route?: string;
  method?: string;
  physical_table?: ClickHouseQueryPhysicalTable;
  service?: ClickHouseQueryService;
};

export type ClickHouseQueryTags = {
  surface?: ClickHouseQuerySurface;
  route?: string;
  method?: string;
  feature?: ClickHouseQueryFeature;
  entity?: ClickHouseQueryEntity;
  storage?: ClickHouseQueryStorage;
  workload?: ClickHouseQueryWorkload;
  project_id?: string | "multiple" | "none" | "unknown";
  physical_table?: ClickHouseQueryPhysicalTable;
  service?: ClickHouseQueryService;

  // Compatibility fields. Keep these typed while dashboards migrate to the
  // structured fields above.
  type?: string;
  kind?: string;
  projectId?: string;
  operation_name?: string;

  // Low-cardinality migration/script labels used by older callers.
  operation?: string;
  table?: string;
};

type NormalizeClickHouseQueryTagsArgs = {
  tags?: ClickHouseQueryTags;
  operation?: "select" | "command" | "insert" | "upsert";
  table?: string;
};

const BAGGAGE_KEYS = {
  surface: "langfuse.clickhouse.surface",
  route: "langfuse.clickhouse.route",
  method: "langfuse.clickhouse.method",
  service: "langfuse.clickhouse.service",
  projectId: "langfuse.project.id",
} as const;

const FORBIDDEN_LOG_COMMENT_KEYS = new Set([
  "queryId",
  "query_id",
  "traceId",
  "trace_id",
  "observationId",
  "observation_id",
  "scoreId",
  "score_id",
  "userId",
  "user_id",
]);

const STRUCTURED_TAG_KEYS = new Set([
  "tag_schema_version",
  "surface",
  "route",
  "method",
  "feature",
  "entity",
  "storage",
  "workload",
  "project_id",
  "physical_table",
  "service",
]);

function isOneOf<T extends readonly string[]>(
  values: T,
  value: string | undefined,
): value is T[number] {
  return value !== undefined && values.includes(value);
}

function getBaggageValue(key: string): string | undefined {
  return opentelemetry.propagation
    .getBaggage(opentelemetry.context.active())
    ?.getEntry(key)?.value;
}

function firstDefined(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function sanitizeTagValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeClickHouseRoute(
  route: string | undefined,
): string | undefined {
  const value = sanitizeTagValue(route)?.split("?")[0]?.split("#")[0];
  if (!value) return undefined;

  return value
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      if (/^[0-9a-f]{24,}$/i.test(segment)) return ":id";
      if (/^[a-z0-9_-]{24,}$/i.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

function getExplicitPhysicalTable(
  tags: ClickHouseQueryTags | undefined,
  table?: string,
): ClickHouseQueryPhysicalTable | undefined {
  const physicalTable = firstDefined(tags?.physical_table, table, tags?.table);
  return physicalTable as ClickHouseQueryPhysicalTable | undefined;
}

function isEventsPhysicalTable(
  physicalTable: ClickHouseQueryPhysicalTable | undefined,
): boolean {
  return (
    physicalTable === "events" ||
    physicalTable === "events_core" ||
    physicalTable === "events_full"
  );
}

function inferStorage(
  tags: ClickHouseQueryTags | undefined,
  physicalTable: ClickHouseQueryPhysicalTable | undefined,
): ClickHouseQueryStorage {
  if (isOneOf(CLICKHOUSE_QUERY_STORAGES, tags?.storage)) return tags.storage;

  if (physicalTable === "multiple") return "mixed";
  if (physicalTable)
    return isEventsPhysicalTable(physicalTable) ? "events" : "legacy";

  const legacyType = sanitizeTagValue(tags?.type)?.toLowerCase();
  if (
    legacyType === "events" ||
    legacyType === "events_core" ||
    legacyType === "events_full"
  ) {
    return "events";
  }

  if (
    legacyType === "trace" ||
    legacyType === "traces" ||
    legacyType === "observation" ||
    legacyType === "observations" ||
    legacyType === "score" ||
    legacyType === "scores" ||
    legacyType === "dataset-run-item" ||
    legacyType === "dataset-run-items" ||
    legacyType === "dataset_run_items_rmt" ||
    legacyType === "blob-storage-file-log" ||
    legacyType === "blob_storage_file_log"
  ) {
    return "legacy";
  }

  return "unknown";
}

function inferSurface(
  tags: ClickHouseQueryTags | undefined,
): ClickHouseQuerySurface {
  if (isOneOf(CLICKHOUSE_QUERY_SURFACES, tags?.surface)) return tags.surface;

  const baggageSurface = getBaggageValue(BAGGAGE_KEYS.surface);
  if (isOneOf(CLICKHOUSE_QUERY_SURFACES, baggageSurface)) {
    return baggageSurface;
  }

  if (tags?.feature === "batch-export") return "batch-export";
  if (tags?.feature === "custom-queries") return "custom-query";
  if (tags?.feature === "ingestion") return "worker";
  if (tags?.feature === "data-retention") return "worker";
  if (tags?.feature === "background-migration") return "worker";

  return "internal";
}

function inferWorkload(
  tags: ClickHouseQueryTags | undefined,
  operation: NormalizeClickHouseQueryTagsArgs["operation"],
): ClickHouseQueryWorkload {
  if (isOneOf(CLICKHOUSE_QUERY_WORKLOADS, tags?.workload)) {
    return tags.workload;
  }

  const kind = tags?.kind?.toLowerCase();
  if (kind) {
    if (kind === "count" || kind.includes("count")) return "count";
    if (
      kind === "list" ||
      kind === "rows" ||
      kind === "identifiers" ||
      kind.includes("rows")
    ) {
      return "list";
    }
    if (kind.includes("byid") || kind.includes("exists")) return "lookup";
    if (kind.includes("filter")) return "filter-options";
    if (kind === "analytic" || kind === "metrics" || kind === "eval") {
      return "aggregate";
    }
    if (kind === "export") return "export";
    if (kind === "batch-io") return "batch-io";
    if (kind === "delete" || kind.includes("delete")) return "delete";
    if (kind === "upsert" || kind === "insert" || kind === "update") {
      return "write";
    }
  }

  if (operation === "insert" || operation === "upsert") return "write";
  if (operation === "command") {
    const operationName = tags?.operation_name?.toLowerCase();
    if (operationName?.includes("delete")) return "delete";
    return "write";
  }

  return "lookup";
}

function normalizeEntityName(value: string): string {
  const normalizedValue = value.toLowerCase();
  if (normalizedValue === "traces") return "trace";
  if (normalizedValue === "observations") return "observation";
  if (normalizedValue === "scores") return "score";
  if (normalizedValue === "events") return "event";
  if (normalizedValue === "events_core") return "event";
  if (normalizedValue === "events_full") return "event";
  if (normalizedValue === "dataset-run-items") return "dataset-run-item";
  if (normalizedValue === "dataset_run_items_rmt") return "dataset-run-item";
  if (normalizedValue === "blob_storage_file_log")
    return "blob-storage-file-log";
  if (normalizedValue === "traces-table") return "trace";
  return normalizedValue;
}

function inferEntity(
  tags: ClickHouseQueryTags | undefined,
  physicalTable: ClickHouseQueryPhysicalTable | undefined,
): ClickHouseQueryEntity {
  if (tags?.entity) return normalizeEntityName(tags.entity);

  const type = sanitizeTagValue(tags?.type);
  if (type) {
    return normalizeEntityName(type);
  }

  if (physicalTable && physicalTable !== "multiple") {
    return normalizeEntityName(physicalTable);
  }

  const text = `${tags?.operation_name ?? ""} ${
    tags?.operation ?? ""
  }`.toLowerCase();

  if (text.includes("observation")) return "observation";
  if (text.includes("trace")) return "trace";
  if (text.includes("score")) return "score";
  if (text.includes("session")) return "session";
  if (text.includes("dataset")) return "dataset";
  if (text.includes("event")) return "event";

  return "unknown";
}

function inferFeature(
  tags: ClickHouseQueryTags | undefined,
): ClickHouseQueryFeature {
  return sanitizeTagValue(tags?.feature) ?? "unknown";
}

function inferProjectId(tags: ClickHouseQueryTags | undefined): string {
  return (
    sanitizeTagValue(tags?.project_id) ??
    sanitizeTagValue(tags?.projectId) ??
    sanitizeTagValue(getBaggageValue(BAGGAGE_KEYS.projectId)) ??
    "unknown"
  );
}

function sanitizeLegacyTags(
  tags: ClickHouseQueryTags | undefined,
): Record<string, string> {
  const legacyTags: Record<string, string> = {};

  for (const [key, value] of Object.entries(tags ?? {})) {
    if (STRUCTURED_TAG_KEYS.has(key)) continue;
    if (FORBIDDEN_LOG_COMMENT_KEYS.has(key)) continue;
    const sanitizedValue = sanitizeTagValue(value);
    if (sanitizedValue) legacyTags[key] = sanitizedValue;
  }

  return legacyTags;
}

export function normalizeClickHouseQueryTags({
  tags,
  operation = "select",
  table,
}: NormalizeClickHouseQueryTagsArgs): ClickHouseQueryTags &
  NormalizedClickHouseQueryTags &
  Record<string, string> {
  const route = normalizeClickHouseRoute(
    firstDefined(tags?.route, getBaggageValue(BAGGAGE_KEYS.route)),
  );
  const method = firstDefined(
    tags?.method,
    getBaggageValue(BAGGAGE_KEYS.method),
  );
  const service = firstDefined(
    tags?.service,
    getBaggageValue(BAGGAGE_KEYS.service),
  );
  const physicalTable = getExplicitPhysicalTable(tags, table);

  return {
    ...sanitizeLegacyTags(tags),
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: inferSurface(tags),
    ...(route ? { route } : {}),
    ...(method ? { method } : {}),
    feature: inferFeature(tags),
    entity: inferEntity(tags, physicalTable),
    storage: inferStorage(tags, physicalTable),
    workload: inferWorkload(tags, operation),
    project_id: inferProjectId(tags),
    ...(physicalTable ? { physical_table: physicalTable } : {}),
    ...(isOneOf(CLICKHOUSE_QUERY_SERVICES, service) ? { service } : {}),
  };
}
