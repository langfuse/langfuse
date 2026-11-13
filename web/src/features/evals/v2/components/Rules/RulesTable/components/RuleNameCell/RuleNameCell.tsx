/* eslint-disable no-nested-ternary */
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { FeatureReleaseStatus } from "@/src/components/design-system/FeatureReleaseStatus/FeatureReleaseStatus";

export function RuleNameCell({
  name,
  legacy,
  scope = "observation",
  onUpgrade,
}: {
  name: string;
  legacy: boolean;
  /** A trace rule evaluates whole traces; the badge tells it apart in the list. */
  scope?: "observation" | "trace";
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="block truncate font-bold" title={name}>
        {name}
      </span>
      {scope === "trace" ? (
        <Badge color="outline" size="sm" text="Trace" />
      ) : null}
      {legacy ? (
        onUpgrade ? (
          <span onClick={(event) => event.stopPropagation()}>
            <V4MigrationBadgeContent
              onClick={onUpgrade}
              title="Upgrade now"
              showChevron={false}
              compact
            />
          </span>
        ) : (
          <FeatureReleaseStatus status="legacy" />
        )
      ) : null}
    </div>
  );
}
