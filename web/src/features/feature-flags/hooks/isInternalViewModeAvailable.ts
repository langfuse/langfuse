import {
  getSessionEnvironment,
  getSessionUserEmail,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";
import { hasInternalAccess } from "@/src/features/feature-flags/utils";

/** isInternalViewModeAvailable reports whether the session's user, by email and the deployment's experimental-features switch, may switch to the internal view. */
export function isInternalViewModeAvailable(session: MaybeSession): boolean {
  return hasInternalAccess({
    email: getSessionUserEmail(session),
    isExperimentalFeaturesEnabled:
      getSessionEnvironment(session)?.enableExperimentalFeatures === true,
  });
}
