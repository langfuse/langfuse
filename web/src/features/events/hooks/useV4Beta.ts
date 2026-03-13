import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback, useState } from "react";
import posthog from "posthog-js";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type SetV4BetaEnabledOptions = {
  onSuccess?: () => void | Promise<void>;
};

const INTRO_DIALOG_SEEN_KEY = "v4-beta-intro-dialog-seen";

export function useV4Beta() {
  const { data: session, update: updateSession } = useSession();

  const mutation = api.userAccount.setV4BetaEnabled.useMutation();

  const isBetaEnabled = session?.user?.v4BetaEnabled ?? false;
  const [showIntroDialog, setShowIntroDialog] = useState(false);
  const [pendingOnSuccess, setPendingOnSuccess] =
    useState<SetV4BetaEnabledOptions["onSuccess"]>();

  const setBetaEnabled = useCallback(
    (enabled: boolean, options?: SetV4BetaEnabledOptions) => {
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
    (options?: SetV4BetaEnabledOptions) => {
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
    setBetaEnabled,
    enableWithIntro,
    showIntroDialog,
    confirmIntroDialog,
    dismissIntroDialog,
    isLoading: mutation.isPending,
  };
}
