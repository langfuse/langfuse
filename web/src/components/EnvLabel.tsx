import { isRegionProduction } from "@/src/features/organizations/cloudRegions";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { EnvLabelBadge } from "./EnvLabelBadge";

export const EnvLabel = () => {
  const [isHidden, setIsHidden] = useState(false);
  const session = useSession();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();
  if (!isLangfuseCloud) return null;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) return null;
  if (isHidden) return null;
  if (!region) return null;

  const label = isRegionProduction(region) ? `PROD-${region}` : region;
  const variant =
    region === "STAGING"
      ? "staging"
      : region === "DEV"
        ? "development"
        : "production";

  return (
    <EnvLabelBadge
      label={label}
      variant={variant}
      onClick={() => setIsHidden(true)}
    />
  );
};
