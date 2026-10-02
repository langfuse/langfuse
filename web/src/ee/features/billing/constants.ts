export const MAX_EVENTS_FREE_PLAN = 50_000;

/**
 * Longest window the usage breakdown accepts. Billable units are counted by
 * `created_at`, which a minmax skip index covers rather than the sort key, so
 * the bound keeps one request from scanning an org's full history.
 */
export const USAGE_BREAKDOWN_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
