/* eslint-disable no-nested-ternary */
import { Badge } from "@/src/app/design-system/legacy-primitives/badge";
import { V4MigrationBadgeContent } from "@/src/migrations/v4/upgrade-experience/V4MigrationBadgeContent";

export function RuleNameCell({
  name,
  legacy,
  onUpgrade,
}: {
  name: string;
  legacy: boolean;
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="block truncate font-bold" title={name}>
        {name}
      </span>
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
          <Badge variant="warning">Legacy</Badge>
        )
      ) : null}
    </div>
  );
}
