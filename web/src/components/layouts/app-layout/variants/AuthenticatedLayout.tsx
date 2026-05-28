/**
 * Authenticated layout variant
 * Full application layout with sidebar, navigation, support drawer, and payment banner
 * Used for all main application pages when user is authenticated
 */

import { useMemo, type PropsWithChildren } from "react";
import Head from "next/head";
import { SidebarProvider, SidebarInset } from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/nav/app-sidebar";
import { Toaster } from "@/src/components/ui/sonner";
import { TopBannerProvider } from "@/src/features/top-banner";
import { ResizableContent } from "../components/ResizableContent";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import {
  getAvailableCloudRegionOptions,
  getCloudRegionAuthUrl,
} from "@/src/features/organizations/cloudRegions";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import type { Session } from "next-auth";
import type { NavigationItem } from "@/src/components/layouts/utilities/routes";
import type { RouteGroup } from "@/src/components/layouts/routes";
import dynamic from "next/dynamic";
import { useCloudRegionsSignInState } from "@/src/components/layouts/app-layout/hooks/useCloudRegionsSignInState";
import React from "react";

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

const V4EnabledBanner = dynamic(
  () =>
    import("@/src/features/events/components/V4EnabledBanner").then((mod) => ({
      default: mod.V4EnabledBanner,
    })),
  {
    ssr: false,
  },
);

const V4PromoBanner = dynamic(
  () =>
    import("@/src/features/events/components/V4PromoBanner").then((mod) => ({
      default: mod.V4PromoBanner,
    })),
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

type AuthenticatedLayoutInnerProps = PropsWithChildren<{
  user: NonNullable<Session["user"]>;
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
  aiFeaturesEnabled: boolean;
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
export function AuthenticatedLayoutInner({
  children,
  user,
  navigation,
  metadata,
  aiFeaturesEnabled,
  onSignOut,
}: AuthenticatedLayoutInnerProps) {
  const { isLangfuseCloud, region: currentRegion } = useLangfuseCloudRegion();

  const availableRegions = useMemo(
    () => getAvailableCloudRegionOptions(currentRegion),
    [currentRegion],
  );

  const regionSignInState = useCloudRegionsSignInState(
    availableRegions,
    isLangfuseCloud && process.env.NODE_ENV === "production",
  );

  const assistantEnabled =
    useIsFeatureEnabled("inAppAgent") && aiFeaturesEnabled;

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
      ...(isLangfuseCloud
        ? [
            {
              name: "Regions",
              subItems: availableRegions.map((region) => ({
                name: region.name,
                onClick: () => {
                  if (!region.rootUrl) return;
                  window.open(
                    getCloudRegionAuthUrl(region.rootUrl, user.email),
                    "_blank",
                    "noopener,noreferrer",
                  );
                },
                content: (
                  <>
                    {region.flag}
                    {region.name}
                    <>
                      {(currentRegion === region.name ||
                        regionSignInState[region.name] === "signedIn") && (
                        <div className="ml-2 inline-flex items-center gap-1 rounded border border-green-100 bg-green-50 px-2 py-1 text-xs dark:border-green-900 dark:bg-green-900/20">
                          <div className="size-2 rounded-full bg-green-300 dark:bg-green-700"></div>
                          Signed in
                        </div>
                      )}
                    </>
                  </>
                ),
              })),
              content: (
                <>
                  Regions
                  <div className="ml-2 inline-flex rounded border px-2 py-1 text-xs">
                    Current: {currentRegion}
                  </div>
                </>
              ),
            },
          ]
        : []),
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
            <V4EnabledBanner />
            <V4PromoBanner />
            <div className="pt-banner-offset flex min-h-0 flex-1">
              <AppSidebar
                navItems={navigation.mainNavigation}
                secondaryNavItems={navigation.secondaryNavigation}
                userNavProps={userNavProps}
              />
              <SidebarInset className="h-screen-with-banner max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
                <ResizableContent aiAgentEnabled={assistantEnabled}>
                  {children}
                </ResizableContent>
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

type AuthenticatedLayoutProps = Omit<AuthenticatedLayoutInnerProps, "user"> & {
  session: Session;
};

export function AuthenticatedLayout({
  children,
  session,
  ...props
}: AuthenticatedLayoutProps) {
  // Safe assertion: AuthenticatedLayout is only rendered after auth checks pass
  // in AppLayout, which guarantees session.user exists at this point
  const user = session.user;
  if (!user) {
    // This should never happen due to guards in AppLayout, but TypeScript needs this
    return null;
  }

  return (
    <AuthenticatedLayoutInner {...props} user={user}>
      {children}
    </AuthenticatedLayoutInner>
  );
}
