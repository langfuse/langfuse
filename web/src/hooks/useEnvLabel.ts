import { isRegionProduction } from "@/src/features/organizations/cloudRegions";
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
  if (!region) return { visible: false } as const;

  const label = isRegionProduction(region) ? `PROD-${region}` : region;
  const variant =
    region === "STAGING"
      ? "staging"
      : region === "DEV"
        ? "development"
        : "production";

  return {
    visible: true,
    label,
    variant,
    dismiss: () => setIsHidden(true),
  } as const;
};
