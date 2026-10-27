import { type ComponentProps } from "react";
import { ArrowUp } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import {
  describeVersionState,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";
import { cn } from "@/src/utils/tailwind";

/** The compact version badge next to the logo; rendered under the version menu's `Trigger asChild`. */
export function VersionBadge({
  state,
  ...buttonProps
}: { state: SidebarVersionState } & Omit<
  ComponentProps<typeof Button>,
  "children" | "className" | "style" | "variant" | "size" | "asChild"
>) {
  const { backgroundMigrationStatus, update, versionText, updateColor } =
    describeVersionState(state);

  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground h-5 max-w-full min-w-0 translate-y-px py-0 text-[0.625rem] leading-none"
      {...buttonProps}
    >
      <span className="truncate" title={versionText}>
        {versionText}
      </span>
      {backgroundMigrationStatus && (
        <StatusBadge
          type={backgroundMigrationStatus}
          showText={false}
          variant="transparent"
        />
      )}
      {update && !backgroundMigrationStatus && (
        <ArrowUp
          size="sm"
          __rawClassName={cn(updateColor ?? "text-icon-foreground")}
        />
      )}
    </Button>
  );
}
