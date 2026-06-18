/**
 * Whether the grammar search bar should render. It is now **generally available
 * on the v4 events tables** — every user gets it, no longer a per-user Feature
 * Preview opt-in. The bar still only renders on the v4 Observations/Traces
 * tables, so call sites keep gating on `isBetaEnabled && useSearchBarEnabled()`
 * (EventsTable only mounts in v4 mode, so the v4 gate is implicit there).
 *
 * TODO(remove ~2026-06-19, after the GA rollout has been stable for a day or
 * two): this hook is now a force-on shim kept only so a rollback to the opt-in
 * is a one-line revert (restore the `useSession` read below). Once we're
 * confident, delete this hook and inline `true` at the call site, and remove
 * the dead `searchBar` Feature Preview plumbing:
 *   - `features/feature-flags/available-flags.ts` ("searchBar")
 *   - `server/api/routers/userAccount.ts` (setFeaturePreviewEnabled allowlist)
 *   - `features/feature-previews/components/FeaturePreviewModal.tsx` (registry
 *     entry + `PreviewFlag` type + filter-search-bar illustration assets)
 *   - the `searchBar` rows in `userAccount.servertest.ts` /
 *     `FeaturePreviewModal.stories.tsx`
 */
export function useSearchBarEnabled(): boolean {
  return true;
  // Rollback to the per-user Feature Preview opt-in by restoring:
  //   return useSession().data?.user?.featureFlags.searchBar === true;
  // (re-add `import { useSession } from "next-auth/react";` above).
}
