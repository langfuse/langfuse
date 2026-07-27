/**
 * Authenticated layout variant
 * Full application layout with sidebar, navigation, support drawer, and payment banner
 * Used for all main application pages when user is authenticated
 */

import { useEffect, useState, type PropsWithChildren } from "react";
import Head from "next/head";
import { useRouter, type NextRouter } from "next/router";
import {
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/src/components/ui/sidebar";
import {
  AppSidebar,
  type SidebarVersionState,
} from "@/src/components/nav/app-sidebar";
import { type UserNavigationProps } from "@/src/components/nav/nav-user";
import { MobileNavSwitcher } from "@/src/components/nav/mobile-nav-switcher";
import { SidebarNotifications } from "@/src/components/nav/sidebar-notifications";
import { SidebarPresenceProvider } from "@/src/components/nav/sidebar-presence";
import { Toaster } from "@/src/components/ui/sonner";
import { Layer } from "@/src/components/ui/layer";
import { TopBannerProvider } from "@/src/features/top-banner";
import { VersionUpdateBanner } from "@/src/features/version-update";
import { AppContentWithRightDrawer } from "../right-drawer/AppContentWithRightDrawer";
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
import { ControlledFeaturePreviewModal } from "@/src/features/feature-previews/components/ControlledFeaturePreviewModal";
import { InAppAgentWindowHost } from "@/src/ee/features/in-app-agent/components/InAppAgentWindowHost";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { api } from "@/src/utils/api";
import { usePlan } from "@/src/features/entitlements/hooks";
import { env } from "@/src/env.mjs";

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
  const { isLangfuseCloud, region: currentRegion } = useLangfuseCloudRegion();
  const [featurePreviewOpen, setFeaturePreviewOpen] = useState(false);
  const router = useRouter();
  useProjectCookie(router);

  // Safe assertion: AuthenticatedLayout is only rendered after auth checks pass
  // in AppLayout, which guarantees session.user exists at this point
  const user = session.user;
  if (!user) {
    // This should never happen due to guards in AppLayout, but TypeScript needs this
    return null;
  }

  const regionMenuItems = getAvailableCloudRegionOptions(currentRegion).map(
    (region) => ({
      name: region.name,
      content: `${region.flag} ${region.name}`,
      onClick: () => {
        if (!region.rootUrl) return;
        window.open(
          getCloudRegionAuthUrl(region.rootUrl, user.email),
          "_blank",
          "noopener,noreferrer",
        );
      },
    }),
  );

  const hasFeaturePreviews = isLangfuseCloud || user.v4BetaEnabled === true;

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
      ...(hasFeaturePreviews
        ? [
            {
              name: "Feature Preview",
              onClick: () => setFeaturePreviewOpen(true),
            },
          ]
        : []),
      ...(isLangfuseCloud
        ? [
            {
              name: "Regions",
              subItems: regionMenuItems,
              content: (
                <>
                  Regions
                  <div className="ml-2 inline-flex rounded bg-black/5 p-1 text-xs dark:bg-white/10">
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
        <SidebarPresenceProvider>
          <SidebarProvider>
            <div className="flex h-dvh w-full flex-col">
              <PaymentBanner />
              <VersionUpdateBanner />
              <div className="pt-banner-offset flex min-h-0 flex-1">
                <ConnectedAppSidebar
                  navItems={navigation.mainNavigation}
                  secondaryNavItems={navigation.secondaryNavigation}
                  userNavProps={userNavProps}
                  isLangfuseCloud={isLangfuseCloud}
                  routerProjectId={
                    typeof router.query.projectId === "string"
                      ? router.query.projectId
                      : undefined
                  }
                />
                <SidebarInset className="h-screen-with-banner max-w-full md:peer-data-[state=collapsed]:w-[calc(100vw-var(--sidebar-width-icon))] md:peer-data-[state=expanded]:w-[calc(100vw-var(--sidebar-width))]">
                  <AppContentWithRightDrawer>
                    {children}
                  </AppContentWithRightDrawer>
                  {/* Toasts render in the `toast` overlay layer — the last layer
                      in LAYER_ORDER — so they paint above every overlay (incl. a
                      non-modal peek) by DOM order alone, no z-index. Sonner's
                      Toaster is position:fixed, so nesting it in the fixed
                      full-screen layer container is positionally identical. */}
                  <Layer name="toast">
                    <Toaster visibleToasts={1} />
                  </Layer>
                  <CommandMenu mainNavigation={navigation.navigation} />
                  {/* Assistant window host lives here (not in PageHeader with
                      its launcher button) so the open window and its geometry
                      survive route changes. */}
                  <InAppAgentWindowHost />
                </SidebarInset>
              </div>
              {hasFeaturePreviews ? (
                <ControlledFeaturePreviewModal
                  open={featurePreviewOpen}
                  onOpenChange={setFeaturePreviewOpen}
                />
              ) : null}
            </div>
          </SidebarProvider>
        </SidebarPresenceProvider>
      </TopBannerProvider>
    </>
  );
}

function ConnectedAppSidebar({
  navItems,
  secondaryNavItems,
  userNavProps,
  isLangfuseCloud,
  routerProjectId,
}: {
  navItems: GroupedNavigation;
  secondaryNavItems: GroupedNavigation;
  userNavProps: UserNavigationProps;
  isLangfuseCloud: boolean;
  routerProjectId?: string;
}) {
  const { isMobile } = useSidebar();
  const uiCustomization = useUiCustomization();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const plan = usePlan();

  const backgroundMigrationStatus = api.backgroundMigrations.status.useQuery(
    undefined,
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !isLangfuseCloud,
      throwOnError: false,
    },
  );

  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !isLangfuseCloud,
    throwOnError: false,
  });

  const selfHostedPlan =
    plan === "self-hosted:pro" || plan === "self-hosted:enterprise"
      ? plan
      : "oss";

  const versionState: SidebarVersionState = isLangfuseCloud
    ? { deployment: "cloud" }
    : {
        deployment: "self-hosted",
        plan: selfHostedPlan,
        release: checkUpdate.data?.updateType
          ? {
              status: "update-available",
              updateType: checkUpdate.data.updateType,
              latestRelease: checkUpdate.data.latestRelease,
            }
          : { status: "current" },
        migration:
          backgroundMigrationStatus.data &&
          backgroundMigrationStatus.data.status !== "FINISHED"
            ? {
                status: "in-progress",
                phase: backgroundMigrationStatus.data.status.toLowerCase(),
              }
            : { status: "idle" },
      };

  return (
    <AppSidebar
      navItems={navItems}
      secondaryNavItems={secondaryNavItems}
      userNavProps={userNavProps}
      isMobile={isMobile}
      logoLightModeHref={uiCustomization?.logoLightModeHref}
      logoDarkModeHref={uiCustomization?.logoDarkModeHref}
      versionState={versionState}
      showDemoBadge={Boolean(
        env.NEXT_PUBLIC_DEMO_ORG_ID &&
        env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
        routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
        isLangfuseCloud,
      )}
      mobileNavSwitcher={<MobileNavSwitcher />}
      {...(!v4UpgradeUiEnabled
        ? { notifications: <SidebarNotifications /> }
        : {})}
    />
  );
}

/** useProjectCookie pings the visit beacon so the project sentinel can route the user back here. */
function useProjectCookie(router: NextRouter) {
  const projectId = router.query.projectId;
  useEffect(() => {
    if (typeof projectId !== "string") return;
    fetch(`/api/project/${encodeURIComponent(projectId)}/visit`, {
      method: "POST",
    }).catch(() => {});
  }, [projectId]);
}
