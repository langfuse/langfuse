import { env } from "@/src/env.mjs";
import {
  hasLegacyTracingIoSearch,
  LEGACY_IO_SEARCH_TYPES,
} from "@/src/features/traces/lib/legacyIoSearch";
import { BatchTableNames, type TracingSearchType } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";

const LEGACY_TRACING_TABLE_NAMES = new Set<BatchTableNames>([
  BatchTableNames.Traces,
  BatchTableNames.Observations,
]);

export const isLegacyTracingIoSearchDisabled = () =>
  env.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH === "true";

export const hasSearchQuery = (searchQuery?: string | null) =>
  Boolean(searchQuery);

export const isLegacyTracingTableName = (tableName: BatchTableNames) =>
  LEGACY_TRACING_TABLE_NAMES.has(tableName);

type LegacyTracingSearch = {
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
};

type SanitizedLegacyTracingSearch = {
  searchQuery?: string;
  searchType?: TracingSearchType[];
};

const LEGACY_IO_SEARCH_BATCH_JOB_ERROR_MESSAGE =
  "Input/output search is disabled for legacy tracing tables on this instance. Switch to ID, name, or user ID search before creating a batch job.";

export const sanitizeLegacyTracingSearch = ({
  searchQuery,
  searchType,
  tableName,
}: LegacyTracingSearch & {
  tableName: BatchTableNames;
}): SanitizedLegacyTracingSearch => {
  const normalizedSearch = {
    searchQuery: searchQuery ?? undefined,
    searchType: searchType ?? undefined,
  };

  if (!isLegacyTracingIoSearchDisabled()) return normalizedSearch;
  if (!hasSearchQuery(searchQuery)) return normalizedSearch;
  if (!hasLegacyTracingIoSearch(searchType)) return normalizedSearch;
  if (!isLegacyTracingTableName(tableName)) return normalizedSearch;

  const sanitizedSearchType =
    searchType?.filter((type) => !LEGACY_IO_SEARCH_TYPES.has(type)) ?? [];

  return sanitizedSearchType.length > 0
    ? { searchQuery: searchQuery ?? undefined, searchType: sanitizedSearchType }
    : { searchType: ["id"] };
};

export const assertLegacyTracingIoSearchCanCreateBatchJob = ({
  searchQuery,
  searchType,
  tableName,
}: LegacyTracingSearch & {
  tableName: BatchTableNames;
}) => {
  if (!isLegacyTracingIoSearchDisabled()) return;
  if (!hasSearchQuery(searchQuery)) return;
  if (!hasLegacyTracingIoSearch(searchType)) return;
  if (!isLegacyTracingTableName(tableName)) return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: LEGACY_IO_SEARCH_BATCH_JOB_ERROR_MESSAGE,
  });
};
