"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { cn } from "@/src/utils/tailwind";

/**
 * Compact account affordance for the mobile top bar: the user's avatar opening
 * a small menu (settings, theme, sign out). The sidebar keeps the full NavUser;
 * this is the always-visible shell-level shortcut in the minimal mobile chrome.
 */
export const TopbarAccount = ({ className }: { className?: string }) => {
  const session = useSession();
  const user = session.data?.user;

  if (!user) return null;

  const name = user.name ?? "";
  const email = user.email ?? "";
  const initials =
    name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() ||
    email[0]?.toUpperCase() ||
    "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-hidden",
          className,
        )}
        aria-label="Account menu"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.image ?? undefined} alt={name} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
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
          <Link href="/account/settings">Account settings</Link>
        </DropdownMenuItem>
        {/* ThemeToggle stops propagation itself; keep the row from closing the
            menu so the user can flip themes and keep the menu open. */}
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOut({ callbackUrl: "/" }).catch(() => {});
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
