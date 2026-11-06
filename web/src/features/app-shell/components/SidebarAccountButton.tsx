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
      className="hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left outline-hidden transition-colors focus-visible:ring-2"
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
      <span className="grid min-w-0 flex-1 text-sm leading-tight">
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
      <ChevronsUpDown size="base" color="default" />
    </button>
  );
}
