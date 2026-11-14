import {
  getSessionEnvironment,
  type MaybeSession,
  type SessionStatus,
} from "@/src/features/rbac/new/sessionAccessors";
import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

/** getEvalCapabilities is which eval configuration features the session's deployment and project allow. */
export function getEvalCapabilities(
  session: MaybeSession,
  sessionStatus: SessionStatus,
  {
    isV4,
    isCodeEvalEnabled,
    isCodeEvalTemplate,
    isOtel,
    isSdkVersionInfoLoading,
    legacyConfigCount,
    isEvalCountsLoading,
    isLangfuseCloud,
    forceV3Experience,
  }: {
    isV4: boolean;
    isCodeEvalEnabled: boolean;
    isCodeEvalTemplate: boolean | undefined;
    isOtel: boolean | undefined;
    isSdkVersionInfoLoading: boolean;
    legacyConfigCount: number | undefined;
    isEvalCountsLoading: boolean;
    isLangfuseCloud: boolean;
    forceV3Experience: boolean;
  },
): EvalCapabilities {
  const isSessionLoading = sessionStatus === "loading";
  const isCodeEvalConfig = isCodeEvalEnabled && (isCodeEvalTemplate ?? false);

  // Determine OTEL status from SDK version info
  const isNewCompatible = isOtel ?? false;

  const hasLegacyEvals = (legacyConfigCount ?? 0) > 0;

  // The legacy eval experience depends on whether the deployment still writes
  // the legacy tables. Use explicit mode checks so we default to hidden while
  // the session is loading, which prevents a flash of legacy options.
  const v4WriteMode = getSessionEnvironment(session)?.v4WriteMode;

  // Whether a *new* config may use the legacy experience.
  const modeAllowsNewLegacy = isNewLegacyEvalAllowed({
    v4WriteMode,
    isLangfuseCloud,
    isForceV3Project: forceV3Experience,
  });

  return {
    isNewCompatible,
    // True when v4 beta is enabled (SDK check query was run)
    compatibilityCheckWasPerformed: isV4,
    // Allow setting up new legacy evals only if: not a code eval AND the
    // deployment mode offers the legacy experience. Having existing legacy
    // evals no longer grants this; they remain editable via edit mode.
    allowLegacy: !isCodeEvalConfig && modeAllowsNewLegacy,
    isLoading:
      isEvalCountsLoading || isSessionLoading || isSdkVersionInfoLoading,
    hasLegacyEvals,
    forceV3Experience,
  };
}

/** EvalCapabilities is which eval configuration features a project may use, and whether that is still loading. */
export interface EvalCapabilities {
  isNewCompatible: boolean;
  compatibilityCheckWasPerformed: boolean;
  allowLegacy: boolean;
  isLoading: boolean;
  hasLegacyEvals: boolean;
  forceV3Experience: boolean;
}
