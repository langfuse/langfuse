// The sessions feature's public surface (RFC rule 8). Named re-exports only —
// this is what anything outside the feature may use.
//
// Client-safe by construction: no server/ imports. SessionPage / SessionEventsPage
// are deliberately absent: a Next.js page imports its feature's Page component
// directly (same pattern as TracePage).

export { SessionIO } from "@/src/features/sessions/SessionPages";
export { LazyTraceEventsRow } from "@/src/features/sessions/TraceEventsRow";
export { asCommentCounts } from "@/src/features/sessions/sessionDetailPageTypes";
export {
  SESSION_DETAIL_SYSTEM_PRESETS,
  getSessionDetailPresetToApply,
} from "@/src/features/sessions/session-detail-presets";
