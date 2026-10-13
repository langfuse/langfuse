import {
  isRegionProduction,
  type CloudRegionName,
} from "@/src/features/organizations";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { assertUnreachable } from "@/src/utils/types";
import { useMemo } from "react";

export const EnvLabelBadge = ({ region }: { region: CloudRegionName }) => {
  const { label, color } = useMemo(() => {
    const isProduction = isRegionProduction(region);

    if (isProduction) {
      return {
        label: `PROD-${region}`,
        color: "red",
      } as const;
    }

    if (region === "STAGING") {
      return {
        label: region,
        color: "blue",
      } as const;
    }

    if (region === "DEV") {
      return {
        label: region,
        color: "green",
      } as const;
    }

    return assertUnreachable(region);
  }, [region]);

  return <Badge color={color} font="mono" size="sm" text={label} />;
};
