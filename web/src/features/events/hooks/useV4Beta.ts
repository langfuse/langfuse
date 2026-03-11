import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback } from "react";
import posthog from "posthog-js";
import { V4_BETA_ENABLED_POSTHOG_PROPERTY } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function useV4Beta() {
  const { data: session, update: updateSession } = useSession();

  const mutation = api.userAccount.setV4BetaEnabled.useMutation({
    onSuccess: async ({ v4BetaEnabled }) => {
      posthog.setPersonProperties({
        [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
      });
      posthog.register({
        [V4_BETA_ENABLED_POSTHOG_PROPERTY]: v4BetaEnabled,
      });
      await updateSession();
    },
  });

  const isBetaEnabled = session?.user?.v4BetaEnabled ?? false;

  const setBetaEnabled = useCallback(
    (enabled: boolean) => {
      mutation.mutate({ enabled });
    },
    [mutation],
  );

  return {
    isBetaEnabled,
    setBetaEnabled,
    isLoading: mutation.isPending,
  };
}
