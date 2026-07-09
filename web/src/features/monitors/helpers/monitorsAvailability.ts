/** monitorsAvailability.ts owns the deployment-level availability rule for the
 * monitors feature, shared by the tRPC middleware, the sidebar route, and the
 * page permission gate. Monitor evaluation reads the v4 `events` tables (v2
 * query views), so the feature only works where those tables are written: on
 * Langfuse Cloud, and on self-hosted deployments whose
 * LANGFUSE_MIGRATION_V4_WRITE_MODE is `dual` or `events_only`. */

/** V4WriteMode mirrors LANGFUSE_MIGRATION_V4_WRITE_MODE. On the client it is
 * read from the session and is `undefined` until the session has loaded. */
export type V4WriteMode = "legacy" | "dual" | "events_only";

export const isMonitorsAvailable = (p: {
  isLangfuseCloud: boolean;
  v4WriteMode: V4WriteMode | undefined;
}): boolean =>
  p.isLangfuseCloud ||
  p.v4WriteMode === "dual" ||
  p.v4WriteMode === "events_only";
