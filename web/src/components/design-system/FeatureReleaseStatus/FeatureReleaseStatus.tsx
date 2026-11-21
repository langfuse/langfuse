import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

const RELEASE_STATUSES = {
  beta: { text: "Beta", color: "info" },
  new: { text: "New", color: "success" },
  internal: { text: "Internal", color: "amber" },
  "coming-soon": { text: "Coming soon", color: "filled" },
  legacy: { text: "Legacy", color: "filled" },
} as const;

type FeatureReleaseStatusProps = {
  status: keyof typeof RELEASE_STATUSES;
};

/**
 * Where a feature is in its release: Beta, New, Internal (staff only),
 * Coming soon, Legacy. One size; fixed colour and caps per status. Not for the state
 * of a running thing (Failing, Healthy): that is a status `Badge`.
 */
export function FeatureReleaseStatus({ status }: FeatureReleaseStatusProps) {
  const { text, color } = RELEASE_STATUSES[status];
  return (
    <BadgeShell color={color} size="sm">
      <span className="uppercase">{text}</span>
    </BadgeShell>
  );
}
