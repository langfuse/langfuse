/**
 * Whether the grammar search bar should render. It is now **generally available
 * on the v4 events tables** — every user gets it, no longer a per-user Feature
 * Preview opt-in. The bar still only renders on the v4 Observations/Traces
 * tables, so call sites keep gating on `isV4 && useSearchBarEnabled()`
 * (EventsTable only mounts in v4 mode, so the v4 gate is implicit there).
 */
export function useSearchBarEnabled(): boolean {
  return true;
}
