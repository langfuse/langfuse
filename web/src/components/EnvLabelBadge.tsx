import {
  isRegionProduction,
  type CloudRegionName,
} from "@/src/features/organizations/cloudRegions";
import { assertUnreachable } from "@/src/utils/types";
import { cva } from "class-variance-authority";
import { useMemo } from "react";

// Neutral mono chip per the sessions handoff; production regions keep the red
// text as a safety signal.
const envLabelBadgeVariants = cva(
  "bg-muted flex cursor-pointer items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.05em] whitespace-nowrap uppercase",
  {
    variants: {
      variant: {
        development: "text-muted-foreground",
        staging: "text-muted-foreground",
        production: "text-dark-red",
      },
    },
  },
);

export const EnvLabelBadge = ({
  region,
  onClick,
}: {
  region: CloudRegionName;
  onClick: () => void;
}) => {
  const { label, variant } = useMemo(() => {
    const isProduction = isRegionProduction(region);

    if (isProduction) {
      return {
        label: `PROD-${region}`,
        variant: "production",
      } as const;
    }

    if (region === "STAGING") {
      return {
        label: region,
        variant: "staging",
      } as const;
    }

    if (region === "DEV") {
      return {
        label: region,
        variant: "development",
      } as const;
    }

    return assertUnreachable(region);
  }, [region]);

  return (
    <div className={envLabelBadgeVariants({ variant })} onClick={onClick}>
      {label}
    </div>
  );
};
