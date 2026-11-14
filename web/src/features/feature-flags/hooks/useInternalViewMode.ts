import { useSession } from "next-auth/react";

import {
  getSessionEnvironment,
  getSessionUserEmail,
  type MaybeSession,
} from "@/src/features/auth/lib/sessionAccessors";
import { api } from "@/src/utils/api";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { hasInternalAccess } from "../utils";
import { useInternalFeaturesEnabled } from "./useInternalFeaturesEnabled";

export function useInternalViewMode() {
  const session = useSession();
  const enabled = useInternalFeaturesEnabled();
  const available = isInternalViewModeAvailable(session.data);
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

/** isInternalViewModeAvailable reports whether the session's user may switch to the internal view. */
function isInternalViewModeAvailable(session: MaybeSession): boolean {
  return hasInternalAccess({
    email: getSessionUserEmail(session),
    isExperimentalFeaturesEnabled:
      getSessionEnvironment(session)?.enableExperimentalFeatures === true,
  });
}
