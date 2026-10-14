/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger */
"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { signOutCleanly } from "@/src/identity/auth/lib/signOut";
import { Avatar } from "@/src/app/design-system/Avatar/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/app/design-system/legacy-primitives/dropdown-menu";
import { ThemeToggle } from "@/src/app/shell/theming/ThemeToggle";
import { useV4UpgradeUiFlag } from "@/src/migrations/v4/upgrade-experience/useV4UpgradeUiEnabled";
import { cn } from "@/src/app/utils/tailwind";
import { useQueryProjectOrOrganization } from "@/src/identity/projects";
import { accountSettingsPath } from "@/src/app/settings/accountSettingsPath";

/**
 * Compact account affordance for the mobile top bar: the user's avatar opening
 * a small menu (settings, theme, sign out). The sidebar keeps the full NavUser;
 * this is the always-visible shell-level shortcut in the minimal mobile chrome.
 */
export const TopbarAccount = ({
  user,
  className,
}: {
  user: NonNullable<Session["user"]>;
  className?: string;
}) => {
  const showV4Migration = useV4UpgradeUiFlag();
  const { organization } = useQueryProjectOrOrganization();

  const name = user.name ?? "";
  const email = user.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-hidden",
          className,
        )}
        aria-label="Account menu"
      >
        <Avatar
          size="lg"
          src={user.image ?? undefined}
          displayName={name || email || "User"}
          email={email || undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="grid text-left text-sm leading-tight">
            <span className="truncate font-bold" title={name}>
              {name}
            </span>
            <span
              className="text-muted-foreground truncate text-xs"
              title={email}
            >
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountSettingsPath(organization?.id)}>Settings</Link>
        </DropdownMenuItem>
        {showV4Migration ? (
          <DropdownMenuItem asChild>
            <Link href="/v4-migration">v4 Migration</Link>
          </DropdownMenuItem>
        ) : null}
        {/* ThemeToggle stops propagation itself; keep the row from closing the
            menu so the user can flip themes and keep the menu open. */}
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOutCleanly().catch(() => {});
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
