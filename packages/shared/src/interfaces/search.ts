import { z } from "zod";

export const TracingSearchType = z.enum([
  "id",
  "content",
  "input",
  "output",
  "summary",
]);
// id: for searching smaller columns like IDs, types, and other metadata
// content: for searching input/output text of functions traced via OpenTelemetry
// summary: trace IDs whose Topics summary matches; v4 events tables only, and
// callers must check Topics visibility for the project
export type TracingSearchType = z.infer<typeof TracingSearchType>;

export const TRACING_SEARCH_TYPE_REQUIRED_MESSAGE =
  "At least one search type is required when searching tracing data";

export const hasValidTracingSearchTypes = ({
  searchQuery,
  searchType,
}: {
  searchQuery?: string | null;
  searchType?: TracingSearchType[] | null;
}) => !searchQuery || !searchType || searchType.length > 0;
