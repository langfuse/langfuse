import type { TracingSearchType } from "@langfuse/shared";

export const LEGACY_IO_SEARCH_DISABLED_ERROR_MESSAGE =
  "Input/output search is disabled for legacy tracing tables on this instance. Use ID, name, or user ID search instead.";

export const LEGACY_IO_SEARCH_TYPES = new Set<TracingSearchType>([
  "content",
  "input",
  "output",
]);

export const hasLegacyIoSearchType = (
  searchType?: TracingSearchType[] | null,
) => Boolean(searchType?.some((type) => LEGACY_IO_SEARCH_TYPES.has(type)));

export const isLegacyIoSearchDisabledError = (
  error?: { data?: { code?: string } | null; message?: string } | null,
) =>
  error?.data?.code === "BAD_REQUEST" &&
  error.message === LEGACY_IO_SEARCH_DISABLED_ERROR_MESSAGE;
