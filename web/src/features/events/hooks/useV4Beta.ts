import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback } from "react";

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
          onSuccess: async () => {
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
