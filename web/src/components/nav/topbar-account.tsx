/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, @repo/no-null-render */
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { signOutCleanly } from "@/src/features/auth/lib/signOut";
import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import { useV4UpgradeUiFlag } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { cn } from "@/src/utils/tailwind";
import { useTranslations } from "next-intl";
import {
  getAppLocale,
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
} from "@/src/features/i18n/config";
import { useLanguageSwitcher } from "@/src/features/i18n/useLanguageSwitcher";

/**
 * Compact account affordance for the mobile top bar: the user's avatar opening
 * a small menu (settings, theme, sign out). The sidebar keeps the full NavUser;
 * this is the always-visible shell-level shortcut in the minimal mobile chrome.
 */
export const TopbarAccount = ({ className }: { className?: string }) => {
  const t = useTranslations("accountMenu");
  const { locale, selectLocale } = useLanguageSwitcher();
  const session = useSession();
  const showV4Migration = useV4UpgradeUiFlag();
  const user = session.data?.user;

  if (!user) return null;

  const name = user.name ?? "";
  const email = user.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-visible:ring-ring rounded-full focus-visible:ring-2 focus-visible:outline-hidden",
          className,
        )}
        aria-label={t("label")}
      >
        <Avatar
          size="lg"
          src={user.image ?? undefined}
          displayName={name || email || "User"}
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
          <Link href="/account/settings">{t("accountSettings")}</Link>
        </DropdownMenuItem>
        {showV4Migration ? (
          <DropdownMenuItem asChild>
            <Link href="/v4-migration">{t("v4Migration")}</Link>
          </DropdownMenuItem>
        ) : null}
        {/* ThemeToggle stops propagation itself; keep the row from closing the
            menu so the user can flip themes and keep the menu open. */}
        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
          <ThemeToggle />
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("language")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(value) => selectLocale(getAppLocale(value))}
            >
              {SUPPORTED_LOCALES.map((supportedLocale) => (
                <DropdownMenuRadioItem
                  key={supportedLocale}
                  value={supportedLocale}
                >
                  {LOCALE_LABELS[supportedLocale]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            signOutCleanly().catch(() => {});
          }}
        >
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
