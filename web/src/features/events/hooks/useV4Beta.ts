import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback } from "react";
import posthog from "posthog-js";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type SetV4BetaEnabledOptions = {
  onSuccess?: () => void | Promise<void>;
};

export function useV4Beta() {
  const { data: session, update: updateSession } = useSession();

  const mutation = api.userAccount.setV4BetaEnabled.useMutation();

  const isBetaEnabled = session?.user?.v4BetaEnabled ?? false;

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

  return {
    isBetaEnabled,
    setBetaEnabled,
    isLoading: mutation.isPending,
  };
}
