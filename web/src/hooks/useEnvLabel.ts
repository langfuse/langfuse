import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useSession } from "next-auth/react";
import { useState } from "react";

export const useEnvLabel = () => {
  const [isHidden, setIsHidden] = useState(false);
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
