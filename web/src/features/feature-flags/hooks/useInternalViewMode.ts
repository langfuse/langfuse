import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import {
  getSessionEnvironment,
  getSessionUserEmail,
} from "@/src/features/auth/lib/sessionAccessors";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { hasInternalAccess } from "../utils";
import { useInternalFeaturesEnabled } from "./useInternalFeaturesEnabled";

export function useInternalViewMode() {
  const session = useSession();
  const enabled = useInternalFeaturesEnabled();
  const available = hasInternalAccess({
    email: getSessionUserEmail(session.data),
    isExperimentalFeaturesEnabled:
      getSessionEnvironment(session.data)?.enableExperimentalFeatures === true,
  });
  const mutation = api.userAccount.setViewMode.useMutation({
    onSuccess: async () => {
      await session.update();
    },
    onError: (error) =>
      showErrorToast(
        "Failed to update view mode",
        error.message,
        classifyTrpcToastError(error, "account_view_mode.update"),
      ),
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
