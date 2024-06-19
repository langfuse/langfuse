import z from "zod";

import { BatchExport } from "@prisma/client";

import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";

export enum BatchExportStatus {
  QUEUED = "QUEUED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum BatchExportFileFormat {
  JSON = "JSON",
  CSV = "CSV",
}

export enum BatchExportTableName {
  Sessions = "sessions",
}

export const exportOptions: Record<
  BatchExportFileFormat,
  {
    label: string;
    extension: string;
    fileType: string;
  }
> = {
  CSV: { label: "CSV", extension: "csv", fileType: "text/csv" },
  JSON: { label: "JSON", extension: "json", fileType: "application/json" },
} as const;

export const BatchExportQuerySchema = z.object({
  tableName: z.nativeEnum(BatchExportTableName),
  filter: z.array(singleFilter).nullable(),
  orderBy,
  limit: z.number().optional(),
  page: z.number().optional(),
});

export type BatchExportQueryType = z.infer<typeof BatchExportQuerySchema>;

export const CreateBatchExportSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  query: BatchExportQuerySchema,
  format: z.nativeEnum(BatchExportFileFormat),
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
  status: z.nativeEnum(BatchExportStatus),
  query: BatchExportQuerySchema,
  format: z.nativeEnum(BatchExportFileFormat),
  url: z.string().nullable(),
  log: z.string().nullable(),
});

// Ensure that zod type matches the Prisma type
export type BatchExportType =
  z.infer<typeof BatchExportSchema> extends BatchExport
    ? z.infer<typeof BatchExportSchema>
    : never;
