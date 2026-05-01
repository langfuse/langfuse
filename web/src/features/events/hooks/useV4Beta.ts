import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback, useState } from "react";
import posthog from "posthog-js";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type SetV4EnabledOptions = {
  onSuccess?: () => void | Promise<void>;
};

const INTRO_DIALOG_SEEN_KEY = "v4-beta-intro-dialog-seen";

export function useV4Beta() {
  const {
    data: session,
    update: updateSession,
    status: sessionStatus,
  } = useSession();

  const mutation = api.userAccount.setV4BetaEnabled.useMutation();

  const isBetaEnabled = session?.user?.v4BetaEnabled ?? false;
  const canToggleV4 = session?.user?.canToggleV4 === true;
  const isInitializing = sessionStatus === "loading";
  const [showIntroDialog, setShowIntroDialog] = useState(false);
  const [pendingOnSuccess, setPendingOnSuccess] =
    useState<SetV4EnabledOptions["onSuccess"]>();

  const setBetaEnabled = useCallback(
    (enabled: boolean, options?: SetV4EnabledOptions) => {
      mutation.mutate(
        { enabled },
        {
          onSuccess: async ({ v4BetaEnabled }) => {
            posthog.setPersonProperties({
              [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
            });
            posthog.register({
              [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
            });
            await updateSession();
            await options?.onSuccess?.();
          },
        },
      );
    },
    [mutation, updateSession],
  );

  const enableWithIntro = useCallback(
    (options?: SetV4EnabledOptions) => {
      if (
        typeof window !== "undefined" &&
        !localStorage.getItem(INTRO_DIALOG_SEEN_KEY)
      ) {
        setPendingOnSuccess(() => options?.onSuccess);
        setShowIntroDialog(true);
        return;
      }

      setBetaEnabled(true, options);
    },
    [setBetaEnabled],
  );

  const confirmIntroDialog = useCallback(() => {
    localStorage.setItem(INTRO_DIALOG_SEEN_KEY, "true");
    setShowIntroDialog(false);
    setBetaEnabled(true, { onSuccess: pendingOnSuccess });
    setPendingOnSuccess(undefined);
  }, [setBetaEnabled, pendingOnSuccess]);

  const dismissIntroDialog = useCallback(() => {
    setShowIntroDialog(false);
    setPendingOnSuccess(undefined);
  }, []);

  return {
    isBetaEnabled,
    canToggleV4,
    isInitializing,
    setBetaEnabled,
    enableWithIntro,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
    isLoading: mutation.isPending,
  };
}
