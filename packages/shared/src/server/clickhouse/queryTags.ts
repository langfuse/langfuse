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

export type ClickHouseQueryTags = {
  tag_schema_version: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  surface: ClickHouseQuerySurface;
  feature: string;
  entity: string;
  storage: ClickHouseQueryStorage;
  workload: ClickHouseQueryWorkload;
  project_id: string | "multiple" | "none" | "unknown";
  route?: string;
  method?: string;
  physical_table?: string;
  service?: ClickHouseQueryService;
};

export type ClickHouseQueryTagInput = Record<string, string | undefined>;

type NormalizeClickHouseQueryTagsArgs = {
  tags?: ClickHouseQueryTagInput;
  query?: string;
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

const KNOWN_CLICKHOUSE_TABLES = [
  "events_core",
  "events_full",
  "events",
  "traces_null",
  "traces",
  "observations",
  "scores",
  "dataset_run_items_rmt",
  "blob_storage_file_log",
  "observations_batch_staging",
] as const;

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

function extractPhysicalTables(query?: string, table?: string): string[] {
  const candidates = new Set<string>();

  if (table) candidates.add(table);

  if (query) {
    const tablePattern = new RegExp(
      `\\b(?:from|join|into|update|table)\\s+(?:\\w+\\.)?\`?(${KNOWN_CLICKHOUSE_TABLES.join(
        "|",
      )})\`?\\b`,
      "gi",
    );

    for (const match of query.matchAll(tablePattern)) {
      if (match[1]) candidates.add(match[1]);
    }
  }

  return Array.from(candidates);
}

function inferPhysicalTable(
  query?: string,
  table?: string,
): string | undefined {
  const tables = extractPhysicalTables(query, table);
  if (tables.length === 0) return undefined;
  if (tables.length === 1) return tables[0];
  return "multiple";
}

function inferStorage(
  tags: ClickHouseQueryTagInput | undefined,
  query?: string,
  table?: string,
): ClickHouseQueryStorage {
  if (isOneOf(CLICKHOUSE_QUERY_STORAGES, tags?.storage)) return tags.storage;

  const tables = extractPhysicalTables(query, table);
  const hasEvents = tables.some(
    (physicalTable) =>
      physicalTable === "events_core" ||
      physicalTable === "events_full" ||
      physicalTable === "events",
  );
  const hasLegacy = tables.some(
    (physicalTable) =>
      physicalTable !== "events_core" &&
      physicalTable !== "events_full" &&
      physicalTable !== "events",
  );

  if (hasEvents && hasLegacy) return "mixed";
  if (hasEvents) return "events";
  if (hasLegacy) return "legacy";
  return "unknown";
}

function inferSurface(
  tags: ClickHouseQueryTagInput | undefined,
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
  tags: ClickHouseQueryTagInput | undefined,
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
  if (value === "traces") return "trace";
  if (value === "observations") return "observation";
  if (value === "scores") return "score";
  if (value === "events") return "event";
  if (value === "events_core") return "event";
  if (value === "events_full") return "event";
  if (value === "dataset_run_items_rmt") return "dataset-run-item";
  if (value === "blob_storage_file_log") return "blob-storage-file-log";
  if (value === "traces-table") return "trace";
  return value;
}

function inferEntity(
  tags: ClickHouseQueryTagInput | undefined,
  query?: string,
  table?: string,
): string {
  if (tags?.entity) return normalizeEntityName(tags.entity);

  const type = tags?.type;
  if (
    type &&
    type !== "events" &&
    type !== "events_core" &&
    type !== "events_full"
  ) {
    return normalizeEntityName(type);
  }

  const text = `${tags?.operation_name ?? ""} ${tags?.feature ?? ""} ${
    query ?? ""
  }`.toLowerCase();

  if (text.includes("observation")) return "observation";
  if (text.includes("trace")) return "trace";
  if (text.includes("score")) return "score";
  if (text.includes("session")) return "session";
  if (text.includes("dataset")) return "dataset";
  if (text.includes("event")) return "event";

  const physicalTable = inferPhysicalTable(query, table);
  if (physicalTable && physicalTable !== "multiple") {
    return normalizeEntityName(physicalTable);
  }

  return "unknown";
}

function inferFeature(tags: ClickHouseQueryTagInput | undefined): string {
  return sanitizeTagValue(tags?.feature) ?? "unknown";
}

function inferProjectId(tags: ClickHouseQueryTagInput | undefined): string {
  return (
    sanitizeTagValue(tags?.project_id) ??
    sanitizeTagValue(tags?.projectId) ??
    sanitizeTagValue(getBaggageValue(BAGGAGE_KEYS.projectId)) ??
    "unknown"
  );
}

function sanitizeLegacyTags(
  tags: ClickHouseQueryTagInput | undefined,
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
  query,
  operation = "select",
  table,
}: NormalizeClickHouseQueryTagsArgs): ClickHouseQueryTags &
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
  const physicalTable = firstDefined(
    tags?.physical_table,
    inferPhysicalTable(query, table),
  );

  return {
    ...sanitizeLegacyTags(tags),
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: inferSurface(tags),
    ...(route ? { route } : {}),
    ...(method ? { method } : {}),
    feature: inferFeature(tags),
    entity: inferEntity(tags, query, table),
    storage: inferStorage(tags, query, table),
    workload: inferWorkload(tags, operation),
    project_id: inferProjectId(tags),
    ...(physicalTable ? { physical_table: physicalTable } : {}),
    ...(isOneOf(CLICKHOUSE_QUERY_SERVICES, service) ? { service } : {}),
  };
}

export function buildClickHouseLogComment(
  args: NormalizeClickHouseQueryTagsArgs,
): string {
  return JSON.stringify(normalizeClickHouseQueryTags(args));
}
