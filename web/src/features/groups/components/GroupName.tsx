import { Lock } from "@langfuse/icons";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  isScimManaged,
  SCIM_LOCK_LABEL,
} from "@/src/features/groups/groupSource";

/** Group name, with a lock for SCIM groups, whose name and members are read-only here. */
export function GroupName({
  group,
}: {
  group: { displayName: string; source: string };
}) {
  if (!isScimManaged(group)) {
    return (
      <span className="truncate" title={group.displayName}>
        {group.displayName}
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Tooltip label={SCIM_LOCK_LABEL}>
        {({ getTriggerProps }) => (
          <span
            className="text-muted-foreground inline-flex shrink-0"
            aria-label="Locked: synced from your identity provider"
            tabIndex={0}
            {...getTriggerProps()}
          >
            <Lock size="sm" />
          </span>
        )}
      </Tooltip>
      <span className="truncate" title={group.displayName}>
        {group.displayName}
      </span>
    </span>
  );
}
