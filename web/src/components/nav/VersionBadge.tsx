import { type ComponentProps } from "react";
import { Button } from "@/src/components/ui/button";
import { VersionAttentionDot } from "@/src/components/nav/VersionAttentionDot";
import {
  describeVersionState,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";

/** The compact version badge next to the logo; rendered under the version menu's `Trigger asChild`. */
export function VersionBadge({
  state,
  version,
  ...buttonProps
}: {
  state: SidebarVersionState;
  /** Defaults to the build's VERSION. */
  version?: string;
} & Omit<
  ComponentProps<typeof Button>,
  "children" | "className" | "style" | "variant" | "size" | "asChild"
>) {
  const { backgroundMigrationStatus, update, versionText } =
    describeVersionState(state, version);

  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground h-5 translate-y-px gap-1 py-0 text-[0.625rem] leading-none"
      {...buttonProps}
    >
      <span className="whitespace-nowrap">{versionText}</span>
      {update && !backgroundMigrationStatus && (
        <VersionAttentionDot
          label={`New ${update.updateType} version available`}
          tone={update.updateType}
        />
      )}
      {backgroundMigrationStatus && (
        <VersionAttentionDot
          label="Background migration running"
          tone="migration"
        />
      )}
    </Button>
  );
}
