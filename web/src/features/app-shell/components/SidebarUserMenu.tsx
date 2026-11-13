import { type ReactNode } from "react";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  UserMenuItems,
  type UserNavigationItem,
} from "@/src/components/nav/UserMenuItems";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

import {
  useAppShellSidebar,
  useAppShellSidebarStoreApi,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

import { createSidebarMenuControls } from "@/src/features/app-shell/fns/createSidebarMenuControls";

export type SidebarUser = { name: string; email: string; avatar: string };

/** The account menu at the bottom of the sidebar. */
export function SidebarUserMenu({
  user,
  items,
  side,
  children,
}: {
  user: SidebarUser;
  items: UserNavigationItem[];
  side: "right" | "top";
  children: (control: { Trigger: typeof DropdownMenuTrigger }) => ReactNode;
}) {
  const open = useAppShellSidebar((state) => state.activeMenu === "account");
  const store = useAppShellSidebarStoreApi();
  const { onOpenChange, onCloseAutoFocus } = createSidebarMenuControls(
    store,
    "account",
  );
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {children({ Trigger: DropdownMenuTrigger })}
      <DropdownMenuContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side={side}
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="ph-no-capture p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar
              size="md"
              shape="rounded"
              src={user.avatar}
              displayName={user.name}
              email={user.email}
              aria-hidden
            />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-bold" title={user.name}>
                {user.name}
              </span>
              <span className="truncate text-xs" title={user.email}>
                {user.email}
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <UserMenuItems items={items} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
