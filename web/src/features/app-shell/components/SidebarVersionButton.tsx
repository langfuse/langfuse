import { type ComponentProps } from "react";
import { Info } from "@langfuse/icons";
import { VersionAttentionDot } from "@/src/components/nav/VersionAttentionDot";
import {
  describeVersionState,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";
import { cn } from "@/src/utils/tailwind";
import motion from "./sidebarMotion.module.css";

/** One version-menu trigger keeps its position and identity across every sidebar mode. */
export function SidebarVersionButton({
  state,
  ...buttonProps
}: { state: SidebarVersionState } & Omit<
  ComponentProps<"button">,
  "children" | "className" | "style" | "type"
>) {
  const { versionText, update, backgroundMigrationStatus } =
    describeVersionState(state);
  return (
    <button
      type="button"
      aria-label="Version and updates"
      className={cn(
        "text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring rounded-md text-xs outline-hidden focus-visible:ring-2",
        motion.version,
      )}
      {...buttonProps}
    >
      <span className={motion.iconLane}>
        <Info size="base" />
        {update && !backgroundMigrationStatus && (
          <span className={motion.statusDot}>
            <VersionAttentionDot
              label={`New ${update.updateType} version available`}
              tone={update.updateType}
            />
          </span>
        )}
        {backgroundMigrationStatus && (
          <span className={motion.statusDot}>
            <VersionAttentionDot
              label="Background migration running"
              tone="migration"
            />
          </span>
        )}
      </span>
      <span className={cn(motion.identity, motion.label)}>{versionText}</span>
    </button>
  );
}
