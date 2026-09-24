// The trace-graph-view feature's public client surface (RFC rule 8).
// Named re-exports only — exactly what other features already imported.
//
// AgentGraphDataSchema stays on server/index.ts so eventsRouter does
// not load TraceGraphView.
export { TraceGraphView } from "@/src/features/trace-graph-view/components/TraceGraphView";
export {
  GRAPH_VIEW_MODES,
  type AgentGraphDataResponse,
  type GraphViewMode,
} from "@/src/features/trace-graph-view/types";
