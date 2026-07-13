import z from "zod";

import { BatchExport } from "@prisma/client";

import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { BatchTableNames } from "../../interfaces/tableNames";
import { TracingSearchType } from "../../interfaces/search";

export enum BatchExportStatus {
  QUEUED = "QUEUED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

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
    filter: z.array(singleFilter).nullable(),
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
    if (query.tableName === BatchTableNames.Datasets) {
      ctx.addIssue({
        code: "custom",
        path: ["tableName"],
        message: "datasets cannot be exported",
      });
    }
  });

export type BatchExportQueryType = z.infer<typeof BatchExportQuerySchema>;

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
