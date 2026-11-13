import motion from "./sidebarMotion.module.css";
import { cn } from "@/src/utils/tailwind";
import { type ComponentProps } from "react";
import { ChevronsUpDown } from "@langfuse/icons";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { type SidebarUser } from "@/src/features/app-shell/components/SidebarUserMenu";

/** The signed-in user's row; rendered under the account menu's `Trigger asChild`. */
export function SidebarAccountButton({
  user,
  ...buttonProps
}: { user: SidebarUser } & Omit<
  ComponentProps<"button">,
  "children" | "className" | "style" | "type"
>) {
  return (
    <button
      type="button"
      aria-label={`Account menu for ${user.name || user.email}`}
      className={cn(
        "ph-no-capture hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent focus-visible:ring-sidebar-ring rounded-md outline-hidden transition-colors focus-visible:ring-2",
        motion.account,
      )}
      {...buttonProps}
    >
      <span className={motion.iconLane}>
        <Avatar
          size="md"
          shape="rounded"
          src={user.avatar}
          displayName={user.name}
          email={user.email}
          aria-hidden
        />
      </span>
      <span className={cn(motion.identity, motion.label)}>
        <span className="text-foreground truncate font-bold" title={user.name}>
          {user.name}
        </span>
        <span
          className="text-muted-foreground truncate text-xs"
          title={user.email}
        >
          {user.email}
        </span>
      </span>
      <span className={cn(motion.chevron, motion.label)}>
        <ChevronsUpDown size="base" color="default" />
      </span>
    </button>
  );
}
