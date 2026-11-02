// The events feature's server surface (RFC rule 9, amended): server code
// reaches events' ClickHouse services through here, never through the
// client-safe root index.
export type { EventBatchIOOutput } from "@/src/features/events/server/eventsRouter";
export {
  getEventFilterNumericRange,
  getEventFilterValuePage,
} from "@/src/features/events/server/eventsService";
export { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
export {
  canToggleV4,
  isV4UpgradeUiAvailable,
  shouldAutoEnableV4,
  V4_DEFAULT_ENABLED_FROM_AT,
} from "@/src/features/events/lib/v4Rollout";
