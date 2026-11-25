import motion from "./sidebarMotion.module.css";
import { cn } from "@/src/utils/tailwind";
import { type ComponentProps } from "react";
import { ChevronsUpDown } from "@langfuse/icons";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { VersionAttentionDot } from "@/src/components/nav/VersionAttentionDot";
import {
  describeVersionState,
  getVersionStatusDot,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";
import { type SidebarUser } from "@/src/features/app-shell/components/SidebarUserMenu";
import { type SidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";

/** The signed-in user's row; rendered under the account menu's `Trigger asChild`. */
export function SidebarAccountButton({
  user,
  surface,
  versionState,
  ...buttonProps
}: {
  user: SidebarUser;
  surface: SidebarSurface;
  versionState: SidebarVersionState;
} & Omit<
  ComponentProps<"button">,
  "children" | "className" | "style" | "type"
>) {
  const versionDetails = describeVersionState(versionState);
  const versionStatusDot = getVersionStatusDot(versionDetails);
  return (
    <button
      type="button"
      aria-label={`Account menu for ${user.name || user.email}`}
      data-surface={surface}
      className={cn(
        "ph-no-capture hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent focus-visible:ring-sidebar-ring rounded-md text-sm leading-tight outline-hidden focus-visible:ring-2",
        motion.account,
      )}
      {...buttonProps}
    >
      <span className={motion.iconLane}>
        <Avatar
          size="sm"
          shape="rounded"
          src={user.avatar}
          displayName={user.name}
          email={user.email}
          aria-hidden
        />
        {surface === "collapsed" && versionStatusDot && (
          <span className={motion.statusDot}>
            <VersionAttentionDot {...versionStatusDot} />
          </span>
        )}
      </span>
      <span
        className={cn(motion.identity, motion.label)}
        data-surface={surface}
      >
        <span
          className="text-foreground truncate font-bold"
          title={user.name || user.email}
        >
          {user.name || user.email}
        </span>
        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
          <span className="truncate" title={versionDetails.versionText}>
            {versionDetails.versionText}
          </span>
          {versionStatusDot && <VersionAttentionDot {...versionStatusDot} />}
        </span>
      </span>
      <span className={cn(motion.chevron, motion.label)}>
        <ChevronsUpDown size="base" color="default" />
      </span>
    </button>
  );
}
