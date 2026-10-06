import { formatCompactRelativeTime } from "@/src/utils/dates";

export type LastTraceAt = Date | string | null | undefined;

const NO_TRACES = "No traces in 30d";

/** Card line: with the "Last trace" label. */
export const formatLastTrace = (lastTraceAt: LastTraceAt) =>
  lastTraceAt
    ? `Last trace ${formatCompactRelativeTime(new Date(lastTraceAt))}`
    : NO_TRACES;
