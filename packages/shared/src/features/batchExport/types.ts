import { AgentTraceScopeSchema } from "../agents/api";
import z from "zod";

import { BatchExport } from "@prisma/client";

import { singleFilterList } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { BatchTableNames } from "../../interfaces/tableNames";
import {
  hasValidTracingSearchTypes,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  TracingSearchType,
} from "../../interfaces/search";

export enum BatchExportStatus {
  QUEUED = "QUEUED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/** Interval at which the worker refreshes a running export's updatedAt. */
export const BATCH_EXPORT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/** Age after which an untouched QUEUED/PROCESSING export stops blocking its user's next one. */
export const BATCH_EXPORT_ABANDONED_AFTER_MS =
  3 * BATCH_EXPORT_HEARTBEAT_INTERVAL_MS;

export enum BatchExportFileFormat {
  JSON = "JSON",
  CSV = "CSV",
  JSONL = "JSONL",
}

// Use shared BatchTableNames enum for consistency across batch operations
// Keep BatchExportTableName as alias for backward compatibility
export { BatchTableNames as BatchExportTableName };

export const exportOptions: Record<
  BatchExportFileFormat,
  {
    label: string;
    extension: string;
    fileType: string;
  }
> = {
  CSV: { label: "CSV", extension: "csv", fileType: "text/csv; charset=utf-8" },
  JSON: {
    label: "JSON",
    extension: "json",
    fileType: "application/json; charset=utf-8",
  },
  JSONL: {
    label: "JSONL",
    extension: "jsonl",
    fileType: "application/x-ndjson; charset=utf-8",
  },
} as const;

export const BatchExportQuerySchema = z
  .object({
    tableName: z.enum(BatchTableNames),
    agentScope: AgentTraceScopeSchema.optional(),
    filter: singleFilterList.nullable(),
    searchQuery: z.string().optional(),
    searchType: z.array(TracingSearchType).optional(),
    orderBy,
    limit: z.number().optional(),
    page: z.number().optional(),
    // Snapshotted at dispatch time from the user's v4 beta flag. When true, the
    // sessions export reads from the ClickHouse events table instead of the
    // legacy traces path. Persisted in the job's query column so the worker reads
    // the snapshot, never the live user record.
    useEventsTable: z.boolean().optional(),
  })
  // Reject `datasets` at runtime, not by narrowing the `tableName` enum:
  // BatchExportQueryType is shared with the batch-action read stream (which
  // handles every table), so a narrowed type breaks the worker typecheck.
  .superRefine((query, ctx) => {
    if (!hasValidTracingSearchTypes(query)) {
      ctx.addIssue({
        code: "custom",
        path: ["searchType"],
        message: TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
      });
    }

    if (
      query.agentScope &&
      query.tableName !== BatchTableNames.Events &&
      query.tableName !== BatchTableNames.Sessions
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["agentScope"],
        message: "Agent-scoped exports require events or sessions.",
      });
    }
    if (
      query.agentScope &&
      query.tableName === BatchTableNames.Sessions &&
      query.agentScope.mode &&
      query.agentScope.mode !== "traces"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["agentScope", "mode"],
        message: "Session exports require trace membership.",
      });
    }

    if (query.tableName === BatchTableNames.Datasets) {
      ctx.addIssue({
        code: "custom",
        path: ["tableName"],
        message: "datasets cannot be exported",
      });
    }
  });

export type BatchExportQueryType = z.infer<typeof BatchExportQuerySchema>;

const AgentScopedExportEnvelopeSchema = z
  .object({
    kind: z.literal("agent-scoped-export-v1"),
    query: BatchExportQuerySchema.strict().refine(
      (query) => query.agentScope !== undefined,
      "Scoped exports require agent criteria.",
    ),
  })
  .strict();

/** Older workers reject the envelope because their required top-level tableName is absent. */
export const persistBatchExportQuery = (query: BatchExportQueryType) =>
  query.agentScope ? { kind: "agent-scoped-export-v1" as const, query } : query;

/** Unknown envelopes and unversioned scoped jobs must never fall back to an unscoped reader. */
export const PersistedBatchExportQuerySchema = z.union([
  AgentScopedExportEnvelopeSchema.transform((envelope) => envelope.query),
  BatchExportQuerySchema.refine(
    (query) => query.agentScope === undefined,
    "Agent-scoped jobs require a versioned envelope.",
  ).and(z.object({ kind: z.undefined().optional() })),
]);

export const CreateBatchExportSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  query: BatchExportQuerySchema,
  format: z.enum(BatchExportFileFormat),
});

export const BatchExportSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  projectId: z.string(),
  userId: z.string(),
  finishedAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  name: z.string(),
  status: z.enum(BatchExportStatus),
  query: BatchExportQuerySchema,
  format: z.enum(BatchExportFileFormat),
  url: z.string().nullable(),
  log: z.string().nullable(),
});

// Ensure that zod type matches the Prisma type
export type BatchExportType =
  z.infer<typeof BatchExportSchema> extends BatchExport
    ? z.infer<typeof BatchExportSchema>
    : never;
