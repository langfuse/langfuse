import type { Session } from "next-auth";
import { isInternalViewEnabled } from "@/src/features/feature-flags/utils";

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
    session?.user?.v4BetaEnabled === true ||
    isInternalViewEnabled(session) ||
    session?.user?.featureFlags.langfuseTopics === true
  );
}
