import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useSession } from "next-auth/react";
import { useState } from "react";

/**
 * Session-scoped so the badge stays hidden while screenshots are taken, instead
 * of coming back on the next navigation. `sessionStorage` is per tab, so
 * closing the tab is the way back — which matters, because this badge is the
 * only thing telling `PROD-EU` apart from `STAGING`.
 */
const ENV_LABEL_HIDDEN_STORAGE_KEY = "langfuse-env-label-hidden";

/**
 * Read lazily and written only on dismissal, rather than through
 * `useSessionStorage`: that hook writes its value on every mount, and this hook
 * runs in both page headers for every visitor — so it would leave the key in
 * the storage of every self-hosted and non-staff user, none of whom can ever
 * see the badge. The `try` covers SSR (no `sessionStorage`) and the browsers
 * that refuse storage outright.
 */
const readHidden = () => {
  try {
    return sessionStorage.getItem(ENV_LABEL_HIDDEN_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

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
