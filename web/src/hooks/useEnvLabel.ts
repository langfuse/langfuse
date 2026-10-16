import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { useSession } from "next-auth/react";

import useSessionStorage from "@/src/components/useSessionStorage";

/**
 * Session-scoped so the badge stays hidden while screenshots are taken, instead
 * of coming back on the next navigation. `sessionStorage` is per tab, so
 * closing the tab is the way back — which matters, because this badge is the
 * only thing telling `PROD-EU` apart from `STAGING`.
 */
const ENV_LABEL_HIDDEN_STORAGE_KEY = "langfuse-env-label-hidden";

export const useEnvLabel = () => {
  const [isHidden, setIsHidden] = useSessionStorage<boolean>(
    ENV_LABEL_HIDDEN_STORAGE_KEY,
    false,
  );
  const session = useSession();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();

  if (!isLangfuseCloud) return { visible: false } as const;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) {
    return { visible: false } as const;
  }
  if (isHidden) return { visible: false } as const;

  return {
    visible: true,
    region: region,
    dismiss: () => setIsHidden(true),
  } as const;
};
