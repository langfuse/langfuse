import { cn } from "@/src/utils/tailwind";
import { type ComponentProps } from "react";
import { ChevronsUpDown } from "@langfuse/icons";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { type SidebarUser } from "@/src/features/app-shell/components/SidebarUserMenu";

/** The signed-in user's row; rendered under the account menu's `Trigger asChild`. */
export function SidebarAccountButton({
  user,
  isCollapsed,
  ...buttonProps
}: { user: SidebarUser; isCollapsed: boolean } & Omit<
  ComponentProps<"button">,
  "children" | "className" | "style" | "type"
>) {
  return (
    <button
      type="button"
      aria-label={`Account menu for ${user.name || user.email}`}
      className={cn(
        "ph-no-capture hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent focus-visible:ring-sidebar-ring flex w-full min-w-0 items-center rounded-md text-left outline-hidden transition-colors focus-visible:ring-2",
        isCollapsed ? "h-9 justify-center" : "h-11 gap-2 px-2",
      )}
      {...buttonProps}
    >
      <Avatar
        size="md"
        shape="rounded"
        src={user.avatar}
        displayName={user.name}
        email={user.email}
        aria-hidden
      />
      <span
        className={
          isCollapsed ? "sr-only" : "grid min-w-0 flex-1 text-sm leading-tight"
        }
      >
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
      {!isCollapsed && <ChevronsUpDown size="base" color="default" />}
    </button>
  );
}
