import { isRegionProduction } from "@/src/features/organizations/cloudRegions";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { cn } from "@/src/utils/tailwind";
import { useSession } from "next-auth/react";
import { useState } from "react";

export const EnvLabel = ({ className }: { className?: string }) => {
  const [isHidden, setIsHidden] = useState(false);
  const session = useSession();
  const { isLangfuseCloud, region } = useLangfuseCloudRegion();
  const label =
    region && isRegionProduction(region) ? `PROD-${region}` : region;

  if (!isLangfuseCloud) return null;
  if (!session.data?.user?.email?.endsWith("@langfuse.com")) return null;
  if (isHidden) return null;
  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-1 self-stretch rounded-md px-1 py-0.5 text-xs whitespace-nowrap",
        region === "STAGING"
          ? "bg-light-blue text-dark-blue"
          : region === "DEV"
            ? "bg-light-green text-dark-green"
            : "bg-light-red text-dark-red",
        className,
      )}
      onClick={() => setIsHidden(true)}
    >
      {label}
    </div>
  );
};
