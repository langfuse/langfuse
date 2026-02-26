/**
 * Authenticated layout variant
 * Full application layout with sidebar, navigation, support drawer, and payment banner
 * Used for all main application pages when user is authenticated
 */

import type { PropsWithChildren } from "react";
import Head from "next/head";
import { SidebarProvider, SidebarInset } from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import { Toaster } from "@/src/components/ui/sonner";
import { TopBannerProvider } from "@/src/features/top-banner";
import { ResizableContent } from "../components/ResizableContent";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import type { Session } from "next-auth";
import type { NavigationItem } from "@/src/components/layouts/utilities/routes";
import type { RouteGroup } from "@/src/components/layouts/routes";
import dynamic from "next/dynamic";

const CommandMenu = dynamic(
  () =>
    import("@/src/features/command-k-menu/CommandMenu").then((mod) => ({
      default: mod.CommandMenu,
    })),
  {
    ssr: false,
  },
);

const PaymentBanner = dynamic(
  () =>
    import("@/src/features/payment-banner").then((mod) => ({
      default: mod.PaymentBanner,
    })),
  {
    ssr: false,
  },
);

const V4BetaEnabledBanner = dynamic(
  () =>
    import("@/src/features/events/components/V4BetaEnabledBanner").then(
      (mod) => ({
        default: mod.V4BetaEnabledBanner,
      }),
    ),
  {
    ssr: false,
  },
);

/** Grouped navigation structure returned by processNavigation */
type GroupedNavigation = {
  ungrouped: NavigationItem[];
  grouped: Partial<Record<RouteGroup, NavigationItem[]>> | null;
  flattened: NavigationItem[];
};

type AuthenticatedLayoutProps = PropsWithChildren<{
  session: Session;
  navigation: {
    mainNavigation: GroupedNavigation;
    secondaryNavigation: GroupedNavigation;
    navigation: NavigationItem[];
  };
  metadata: {
    title: string;
    faviconPath: string;
    favicon256Path: string;
    appleTouchIconPath: string;
  };
  onSignOut: () => void;
}>;

/**
 * Full authenticated layout with all features:
 * - AppSidebar with navigation
 * - Payment banner (conditional)
 * - Support drawer
 * - Command menu (Cmd/Ctrl+K)
 * - Toast notifications
 * - Dynamic page metadata
 */
export function AuthenticatedLayout({
  children,
  session,
  navigation,
  metadata,
  onSignOut,
}: AuthenticatedLayoutProps) {
  // Safe assertion: AuthenticatedLayout is only rendered after auth checks pass
  // in AppLayout, which guarantees session.user exists at this point
  const user = session.user;
  if (!user) {
    // This should never happen due to guards in AppLayout, but TypeScript needs this
    return null;
  }

  // User navigation items for sidebar dropdown
  const userNavProps = {
    user: {
      name: user.name ?? "",
      email: user.email ?? "",
      avatar: user.image ?? "",
    },
    items: [
      { name: "Account Settings", href: "/account/settings" },
      { name: "Theme", onClick: () => {}, content: <ThemeToggle /> },
      { name: "Sign out", onClick: onSignOut },
    ],
  };

  return (
    <>
      <Head>
        <title>{metadata.title}</title>
        <link rel="icon" type="image/svg+xml" href={metadata.faviconPath} />
        <link
          rel="icon"
          type="image/png"
          sizes="256x256"
          href={metadata.favicon256Path}
        />
        <link rel="apple-touch-icon" href={metadata.appleTouchIconPath} />
      </Head>

      <TopBannerProvider>
        <SidebarProvider>
          <div className="flex h-dvh w-full flex-col">
            <PaymentBanner />
            <V4BetaEnabledBanner />
            <div className="flex min-h-0 flex-1 pt-banner-offset">
              <AppSidebar
                navItems={navigation.mainNavigation}
                secondaryNavItems={navigation.secondaryNavigation}
                userNavProps={userNavProps}
              />
              <SidebarInset className="h-screen-with-banner max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
                <ResizableContent>{children}</ResizableContent>
                <Toaster visibleToasts={1} />
                <CommandMenu mainNavigation={navigation.navigation} />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </TopBannerProvider>
    </>
  );
}
