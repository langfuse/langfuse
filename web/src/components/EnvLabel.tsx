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
        // Neutral mono chip per the sessions handoff; production regions keep
        // the red text as a safety signal.
        "bg-muted flex cursor-pointer items-center gap-1 self-center rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.05em] whitespace-nowrap uppercase",
        region === "STAGING" || region === "DEV"
          ? "text-muted-foreground"
          : "text-dark-red",
        className,
      )}
      onClick={() => setIsHidden(true)}
    >
      {label}
    </div>
  );
};
