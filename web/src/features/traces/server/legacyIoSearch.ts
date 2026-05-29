import { env } from "@/src/env.mjs";
import {
  LEGACY_IO_SEARCH_DISABLED_ERROR_MESSAGE,
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

export const hasLegacyTracingIoSearch = (
  searchType?: TracingSearchType[] | null,
) => Boolean(searchType?.some((type) => LEGACY_IO_SEARCH_TYPES.has(type)));

export const hasSearchQuery = (searchQuery?: string | null) =>
  Boolean(searchQuery);

export const isLegacyTracingTableName = (tableName: BatchTableNames) =>
  LEGACY_TRACING_TABLE_NAMES.has(tableName);

export const assertLegacyTracingIoSearchEnabled = ({
  searchQuery,
  searchType,
  tableName,
}: {
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
  tableName: BatchTableNames;
}) => {
  if (!isLegacyTracingIoSearchDisabled()) return;
  if (!hasSearchQuery(searchQuery)) return;
  if (!hasLegacyTracingIoSearch(searchType)) return;
  if (!isLegacyTracingTableName(tableName)) return;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: LEGACY_IO_SEARCH_DISABLED_ERROR_MESSAGE,
  });
};
