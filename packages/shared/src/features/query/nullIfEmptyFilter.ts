/**
 * Matches `nullIf(expr, '')` wrappers used in dimension SQL for display purposes.
 * Capture group 1 is the raw column expression (e.g. `events_traces.user_id`).
 */
export const NULL_IF_EMPTY_RE = /^nullIf\((.+),\s*''\)$/;
