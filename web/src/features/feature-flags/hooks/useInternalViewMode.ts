import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications";
import { hasInternalAccess } from "../utils";
import { useInternalFeaturesEnabled } from "./useInternalFeaturesEnabled";

export function useInternalViewMode() {
  const session = useSession();
  const enabled = useInternalFeaturesEnabled();
  const available = hasInternalAccess({
    isAdmin: session.data?.user?.admin === true,
    isExperimentalFeaturesEnabled:
      session.data?.environment.enableExperimentalFeatures === true,
  });
  const mutation = api.userAccount.setViewMode.useMutation({
    onSuccess: async () => {
      await session.update();
    },
    onError: (error) =>
      showErrorToast("Failed to update view mode", error.message),
  });
  const mode = enabled ? "INTERNAL" : "EXTERNAL";
  return {
    available,
    mode,
    saving: mutation.isPending,
    setMode: (nextMode: "INTERNAL" | "EXTERNAL") => {
      if (available && !mutation.isPending && nextMode !== mode) {
        mutation.mutate({ mode: nextMode });
      }
    },
  };
}
