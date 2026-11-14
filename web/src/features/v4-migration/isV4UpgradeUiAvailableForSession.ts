import {
  getSessionUserV4UpgradeUiAvailable,
  type MaybeSession,
} from "@/src/features/rbac/new/sessionAccessors";

/** isV4UpgradeUiAvailableForSession reports whether the session's deployment shows the v4 migration UI, ignoring per-project force-v3. */
export function isV4UpgradeUiAvailableForSession(
  session: MaybeSession,
): boolean {
  return getSessionUserV4UpgradeUiAvailable(session) === true;
}
