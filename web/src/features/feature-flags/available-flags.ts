export const availableFlags = [
  // TODO(remove ~2026-06-19): "searchBar" is retired — the grammar search bar
  // is now GA on the v4 events tables for everyone (see useSearchBarEnabled),
  // no longer a per-user Feature Preview opt-in. Kept as dead plumbing for a
  // safe rollback; drop once the GA rollout is confirmed stable.
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
