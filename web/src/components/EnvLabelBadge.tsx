import {
  isRegionProduction,
  type CloudRegionName,
} from "@/src/features/organizations";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { assertUnreachable } from "@/src/utils/types";
import { useMemo } from "react";

const DISMISS_HINT = "Hide until this tab is closed";

/**
 * The cloud environment chip in the page header, for Langfuse staff only.
 * Clicking it hides it, which is how clean product screenshots get taken — so
 * it renders through `BadgeShell asChild` as a real `<button>` (focusable,
 * Enter/Space) rather than a `<span>` with a click handler on it.
 */
export const EnvLabelBadge = ({
  region,
  onDismiss,
}: {
  region: CloudRegionName;
  onDismiss: () => void;
}) => {
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
    <BadgeShell asChild color={color} font="mono" size="sm">
      <button
        type="button"
        onClick={onDismiss}
        title={DISMISS_HINT}
        aria-label={`${label}. ${DISMISS_HINT}.`}
        className="ring-offset-background focus-visible:ring-ring cursor-pointer transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      >
        {label}
      </button>
    </BadgeShell>
  );
};
