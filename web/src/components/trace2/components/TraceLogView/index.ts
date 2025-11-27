/**
 * TraceLogView module exports.
 *
 * Main component: TraceLogView - Virtualized log view with lazy I/O loading
 */

export { TraceLogView, type TraceLogViewProps } from "./TraceLogView";
export { TraceLogViewConfirmationDialog } from "./TraceLogViewConfirmationDialog";
export {
  useLogViewConfirmation,
  LOG_VIEW_DISABLED_THRESHOLD,
} from "./useLogViewConfirmation";
