import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { useCallback } from "react";

export function useV4Beta() {
  const { data: session, update: updateSession } = useSession();
  const utils = api.useUtils();

  const mutation = api.userAccount.setV4BetaEnabled.useMutation({
    onSuccess: async () => {
      await updateSession();
      await utils.invalidate();
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
