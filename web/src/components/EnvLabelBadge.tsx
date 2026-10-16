import {
  isRegionProduction,
  type CloudRegionName,
} from "@/src/features/organizations";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { assertUnreachable } from "@/src/utils/types";
import { useMemo } from "react";

/**
 * Left as a `title` rather than an `aria-label`, so the accessible name stays
 * the visible text (`PROD-EU`) and this becomes the description. An
 * `aria-label` would take over the name and the hint would be announced twice.
 */
const DISMISS_HINT = "Hide until this tab is closed";

type EnvLabelBadgeProps = {
  region: CloudRegionName;
  onDismiss: () => void;
};

/**
 * The cloud environment chip in the page header, for Langfuse staff only.
 * Clicking it hides it, which is how clean product screenshots get taken — so
 * it renders through `BadgeShell asChild` as a real `<button>` (focusable,
 * Enter/Space) rather than a `<span>` with a click handler on it.
 */
export const EnvLabelBadge = ({ region, onDismiss }: EnvLabelBadgeProps) => {
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

  return (
    <BadgeShell asChild color={color} font="mono" size="sm" dismissible>
      <button type="button" onClick={onDismiss} title={DISMISS_HINT}>
        {label}
      </button>
    </BadgeShell>
  );
};
