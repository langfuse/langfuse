// The events feature's server surface (RFC rule 9, amended): server code
// reaches events' ClickHouse services through here, never through the
// client-safe root index.
export type { EventBatchIOOutput } from "@/src/tracing/observations/server/eventsRouter";
export {
  getEventFilterNumericRange,
  getEventFilterValuePage,
} from "@/src/tracing/observations/server/eventsService";
export { observationEventsFilterConfig } from "@/src/tracing/observations/config/filter-config";
export {
  canToggleV4,
  isV4UpgradeUiAvailable,
  shouldAutoEnableV4,
  V4_DEFAULT_ENABLED_FROM_AT,
} from "@/src/tracing/observations/lib/v4Rollout";
