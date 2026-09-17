// The events feature's server surface (RFC rule 9, amended): server code
// reaches events' ClickHouse services through here, never through the
// client-safe root index.
export type { EventBatchIOOutput } from "./eventsRouter";
export {
  getEventFilterNumericRange,
  getEventFilterValuePage,
} from "./eventsService";
