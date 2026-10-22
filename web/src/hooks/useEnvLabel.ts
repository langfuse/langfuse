import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useSession } from "next-auth/react";
import { useState } from "react";

/** Storage key for the per-tab dismiss state. */
const ENV_LABEL_HIDDEN_STORAGE_KEY = "langfuse-env-label-hidden";

export const useEnvLabel = () => {
  const [isHidden, setIsHidden] = useState(readHidden);
  const session = useSession();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();

  const dismiss = () => {
    try {
      sessionStorage.setItem(ENV_LABEL_HIDDEN_STORAGE_KEY, "true");
    } catch {
      // Storage refused: still hide it for this page view.
    }
    setIsHidden(true);
  };

  if (!isLangfuseCloud) return { visible: false } as const;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) {
    return { visible: false } as const;
  }
  if (isHidden) return { visible: false } as const;

  return {
    visible: true,
    region: region,
    dismiss,
  } as const;
};

/**
 * Reads the dismiss flag lazily via sessionStorage. Using a separate helper
 * rather than `useSessionStorage` avoids a write on every mount, which would
 * leave the key in the storage of every non-staff visitor. The `try` covers
 * SSR and browsers that refuse storage outright.
 */
function readHidden() {
  try {
    return sessionStorage.getItem(ENV_LABEL_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
