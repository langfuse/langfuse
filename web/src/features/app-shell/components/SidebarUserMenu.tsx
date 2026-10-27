import { useEffect, useRef, type ReactNode } from "react";
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
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";

export type SidebarUser = { name: string; email: string; avatar: string };

/**
 * The account menu at the bottom of the sidebar. While it is open it holds
 * the floating sidebar open, so moving into the menu does not close it.
 */
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
  const { hold } = useAppShellSidebarActions();
  const releaseHoldRef = useRef<(() => void) | null>(null);
  const releaseHold = () => {
    releaseHoldRef.current?.();
    releaseHoldRef.current = null;
  };
  // The menu can unmount while open, e.g. when one of its links navigates.
  useEffect(
    () => () => {
      releaseHoldRef.current?.();
      releaseHoldRef.current = null;
    },
    [],
  );

  return (
    <DropdownMenu
      onOpenChange={(isOpen) => {
        if (isOpen) {
          if (releaseHoldRef.current === null) releaseHoldRef.current = hold();
        } else {
          releaseHold();
        }
      }}
    >
      {children({ Trigger: DropdownMenuTrigger })}
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side={side}
        align="end"
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-0 font-normal">
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
