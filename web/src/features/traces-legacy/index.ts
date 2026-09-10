// The frozen legacy trace detail view is reachable only through
// `src/components/trace-detail-view-switch.tsx`, so this surface is trimmed to
// what that switch renders. `TracePage` stays a direct import, as in
// `src/features/traces`.
export { Trace } from "@/src/features/traces-legacy/components/Trace";
export { TraceDetailBody } from "@/src/features/traces-legacy/components/TraceDetailBody";
