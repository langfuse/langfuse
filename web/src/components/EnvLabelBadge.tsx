import {
  isRegionProduction,
  type CloudRegionName,
} from "@/src/features/organizations/cloudRegions";
import { assertUnreachable } from "@/src/utils/types";
import { cva } from "class-variance-authority";
import { useMemo } from "react";

const envLabelBadgeVariants = cva(
  "flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-xs whitespace-nowrap",
  {
    variants: {
      variant: {
        development: "bg-light-green text-dark-green",
        staging: "bg-light-blue text-dark-blue",
        production: "bg-light-red text-dark-red",
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
