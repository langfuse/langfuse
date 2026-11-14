import type { Session } from "next-auth";
import { isInternalViewEnabled } from "@/src/features/feature-flags/utils";
import {
  getSessionUserFeatureFlags,
  getSessionUserV4BetaEnabled,
} from "@/src/features/rbac/new/sessionAccessors";

/** Account menu and organization settings share this gate for the personal preview modal. */
export function canOpenPersonalFeaturePreviews({
  session,
  isLangfuseCloud,
}: {
  session: Session | null | undefined;
  isLangfuseCloud: boolean;
}): boolean {
  return (
    isLangfuseCloud ||
    getSessionUserV4BetaEnabled(session) === true ||
    isInternalViewEnabled(session) ||
    getSessionUserFeatureFlags(session)?.langfuseTopics === true
  );
}
