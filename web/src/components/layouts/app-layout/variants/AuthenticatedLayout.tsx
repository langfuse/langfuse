/* eslint-disable @typescript-eslint/no-use-before-define */
/**
 * Authenticated layout variant
 * Full application layout with sidebar, navigation, support drawer, and payment banner
 * Used for all main application pages when user is authenticated
 */

import {
  useEffect,
  useState,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import Head from "next/head";
import {
  useInternalViewMode,
  InternalViewModeDialog,
} from "@/src/features/feature-flags/internal-view-mode";
import { useRouter, type NextRouter } from "next/router";
import {
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/src/components/ui/sidebar";
import { AppSidebar } from "@/src/components/nav/AppSidebar/AppSidebar";
import { ClassicNavigationProvider } from "@/src/components/nav/ClassicNavigationProvider";
import { type UserNavigationItem } from "@/src/components/nav/UserMenuItems";
import { useSidebarNotificationState } from "@/src/components/nav/useSidebarNotificationState";
import { useSidebarVersionState } from "@/src/components/nav/useSidebarVersionState";
import { Toaster } from "@/src/components/ui/Toaster";
import { Layer } from "@/src/components/design-system/Layer/Layer";
import {
  VersionUpdateBanner,
  useVersionUpdatePrompt,
} from "@/src/features/version-update";
import { AppContentWithRightDrawer } from "../right-drawer/AppContentWithRightDrawer";
import { ThemeToggle } from "@/src/features/theming/ThemeToggle";
import {
  getAvailableCloudRegionOptions,
  getCloudRegionAuthUrl,
  useLangfuseCloudRegion,
} from "@/src/features/organizations";
import type { Session } from "next-auth";
import type { NavigationItem } from "@/src/components/layouts/utilities/routes";
import type { RouteGroup } from "@/src/components/layouts/routes";
import dynamic from "next/dynamic";
import { canOpenPersonalFeaturePreviews } from "@/src/features/feature-previews/canOpenPersonalFeaturePreviews";
import { ControlledFeaturePreviewModal } from "@/src/features/feature-previews/components/ControlledFeaturePreviewModal";
import { InAppAgentWindowHost } from "@/src/features/in-app-agent/components/InAppAgentWindowHost";
import {
  useV4UpgradeUiEnabled,
  useV4UpgradeUiFlag,
} from "@/src/features/v4-migration/useV4UpgradeUiEnabled";
import { useUiCustomization } from "@/src/ee/features/ui-customization";
import { findCurrentInstance } from "@/src/ee/features/ui-customization/instanceLinks";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useSession } from "next-auth/react";
import { useQueryProjectOrOrganization } from "@/src/features/projects";
import {
  CustomerDataWarningBannerView,
  getCustomerDataWarning,
} from "@/src/features/customer-data-warning";
import { accountSettingsPath } from "@/src/features/settings/accountSettingsPath";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import {
  PaymentBannerView,
  usePaymentBanner,
} from "@/src/features/payment-banner";
import { useTopBannerHeight } from "@/src/features/top-banner";
import {
  AppShell,
  AppShellSidebarPanel,
  useAppShellVariant,
} from "@/src/features/app-shell";

const CommandMenu = dynamic(
  () =>
    import("@/src/features/command-k-menu/CommandMenu").then((mod) => ({
      default: mod.CommandMenu,
    })),
  {
    ssr: false,
  },
);

const PreviewDeploymentBanner = dynamic(
  () =>
    import("@/src/features/preview-deployment-banner").then((mod) => ({
      default: mod.PreviewDeploymentBanner,
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
  onSignOut: () => void;
}>;

/**
 * Full authenticated layout with all features:
 * - App sidebar with navigation (classic or new shell, see useAppShellVariant)
 * - Payment banner (conditional)
 * - Support drawer
 * - Command menu (Cmd/Ctrl+K)
 * - Toast notifications
 * - Dynamic page metadata
 */
export function AuthenticatedLayout({
  children,
  user,
  navigation,
  metadata,
  onSignOut,
}: AuthenticatedLayoutProps) {
  const { isLangfuseCloud, region: currentRegion } = useLangfuseCloudRegion();
  const [featurePreviewOpen, setFeaturePreviewOpen] = useState(false);
  const [internalViewModeOpen, setInternalViewModeOpen] = useState(false);
  const internalViewMode = useInternalViewMode();
  const router = useRouter();
  useProjectCookie(router);
  const uiCustomization = useUiCustomization();
  const appShell = useAppShellVariant();
  const capture = usePostHogClientCapture();
  // Account-level entry: use the raw flag (same as account settings tabs), not
  // project-scoped force-v3 suppression.
  const showV4Migration = useV4UpgradeUiFlag();
  const { organization: currentOrganization } = useQueryProjectOrOrganization();

  const regionMenuItems = getAvailableCloudRegionOptions(currentRegion).map(
    (region) => ({
      type: "action" as const,
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

  // Self-hosted instance switcher (EE): configured via
  // LANGFUSE_UI_INSTANCE_LINKS, delivered through the uiCustomization query.
  const instanceLinks = uiCustomization?.instanceLinks ?? null;
  const currentInstance = instanceLinks
    ? findCurrentInstance(
        instanceLinks,
        typeof window !== "undefined" ? window.location.host : undefined,
      )
    : undefined;
  const instanceMenuItems = (instanceLinks ?? []).map((link) => ({
    type: "action" as const,
    name: link.name,
    onClick: () => {
      window.open(link.url, "_blank", "noopener,noreferrer");
    },
  }));

  const hasFeaturePreviews = canOpenPersonalFeaturePreviews({
    isLangfuseCloud,
    v4BetaEnabled: user.v4BetaEnabled === true,
    isAdmin: user.admin === true,
  });

  const otherShellVariant = appShell.variant === "next" ? "classic" : "next";

  // User navigation items for sidebar dropdown
  const sidebarUser = {
    name: user.name ?? "",
    email: user.email ?? "",
    avatar: user.image ?? "",
  };
  const userMenuItems: UserNavigationItem[] = [
    ...(internalViewMode.available
      ? [
          {
            type: "action" as const,
            name: "View mode",
            onClick: () => setInternalViewModeOpen(true),
          },
        ]
      : []),
    {
      type: "link" as const,
      name: "Settings",
      href: accountSettingsPath(currentOrganization?.id),
    },
    ...(showV4Migration
      ? [
          {
            type: "link" as const,
            name: "v4 Migration",
            href: "/v4-migration",
          },
        ]
      : []),
    {
      type: "action" as const,
      name: "Theme",
      onClick: () => {},
      content: <ThemeToggle />,
    },
    {
      type: "action" as const,
      name:
        otherShellVariant === "classic"
          ? "Switch to classic navigation"
          : "Try the new navigation",
      onClick: () => {
        capture("app_shell:variant_switched", { variant: otherShellVariant });
        appShell.setVariant(otherShellVariant);
      },
    },
    ...(hasFeaturePreviews
      ? [
          {
            type: "action" as const,
            name: "Feature Preview",
            onClick: () => setFeaturePreviewOpen(true),
          },
        ]
      : []),
    ...(isLangfuseCloud
      ? [
          {
            type: "submenu" as const,
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
    ...(instanceMenuItems.length > 0
      ? [
          {
            type: "submenu" as const,
            name: "Instances",
            subItems: instanceMenuItems,
            content: currentInstance ? (
              <>
                Instances
                <div className="ml-2 inline-flex rounded bg-black/5 p-1 text-xs dark:bg-white/10">
                  Current: {currentInstance.name}
                </div>
              </>
            ) : undefined,
          },
        ]
      : []),
    { type: "action" as const, name: "Sign out", onClick: onSignOut },
  ];

  const content = (
    <>
      <AppContentWithRightDrawer>{children}</AppContentWithRightDrawer>
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
    </>
  );

  const routerProjectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;

  return (
    <>
      <Head>
        <title>{metadata.title}</title>
        <link
          key="favicon-svg"
          rel="icon"
          type="image/svg+xml"
          href={metadata.faviconPath}
        />
        <link
          key="favicon-png"
          rel="icon"
          type="image/png"
          sizes="256x256"
          href={metadata.favicon256Path}
        />
        <link
          key="apple-touch-icon"
          rel="apple-touch-icon"
          href={metadata.appleTouchIconPath}
        />
      </Head>

      {appShell.variant === "next" ? (
        <AppFrame user={user}>
          <AppShell
            sidebar={
              <AppShellSidebarPanel
                mainNavigation={navigation.mainNavigation}
                secondaryNavigation={navigation.secondaryNavigation}
                user={sidebarUser}
                userMenuItems={userMenuItems}
                isLangfuseCloud={isLangfuseCloud}
              />
            }
          >
            {content}
          </AppShell>
        </AppFrame>
      ) : (
        <SidebarProvider>
          <ClassicNavigationProvider>
            <AppFrame user={user}>
              <ConnectedAppSidebar
                navItems={navigation.mainNavigation}
                secondaryNavItems={navigation.secondaryNavigation}
                user={sidebarUser}
                userMenuItems={userMenuItems}
                isLangfuseCloud={isLangfuseCloud}
                routerProjectId={routerProjectId}
              />
              {/* `min-w-0`, not a `100vw`-derived width: viewport units ignore
                    scrollbars, and a definite width also floors `min-width:
                    auto`, so on a wide page the inset stayed pinned 15px past
                    the space beside the sidebar once a space-taking vertical
                    scrollbar showed — spawning a horizontal one. Flex already
                    sizes the inset to that space. */}
              <SidebarInset className="h-screen-with-banner max-w-full min-w-0">
                {content}
              </SidebarInset>
            </AppFrame>
          </ClassicNavigationProvider>
        </SidebarProvider>
      )}
      {internalViewMode.available && (
        <InternalViewModeDialog
          open={internalViewModeOpen}
          onOpenChange={setInternalViewModeOpen}
        />
      )}
      {hasFeaturePreviews ? (
        <ControlledFeaturePreviewModal
          open={featurePreviewOpen}
          onOpenChange={setFeaturePreviewOpen}
        />
      ) : null}
    </>
  );
}

/** Full-height column shared by both shells: top banners, then the sidebar and the page side by side. */
function AppFrame({
  user,
  children,
}: {
  user: NonNullable<Session["user"]>;
  children: ReactNode;
}) {
  const router = useRouter();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const versionUpdatePrompt = useVersionUpdatePrompt();
  const paymentBanner = usePaymentBanner();
  const topBannerRef = useTopBannerHeight();
  const { organization: currentOrganization, project: currentProject } =
    useQueryProjectOrOrganization();
  const customerDataWarning = getCustomerDataWarning({
    email: user.email,
    isAdmin: user.admin === true,
    isLangfuseCloud,
    projectId:
      typeof router.query.projectId === "string"
        ? router.query.projectId
        : null,
    organizationId:
      typeof router.query.organizationId === "string"
        ? router.query.organizationId
        : null,
    memberships: user.organizations,
    organizationName: currentOrganization?.name ?? null,
    projectName: currentProject?.name ?? null,
  });

  return (
    <div className="flex h-dvh w-full flex-col">
      <div ref={topBannerRef} className="fixed top-0 z-51 flex w-full flex-col">
        {customerDataWarning && (
          <CustomerDataWarningBannerView {...customerDataWarning} />
        )}
        {paymentBanner && (
          <PaymentBannerView
            organizationName={paymentBanner.organizationName}
            billingSettingsHref={paymentBanner.billingSettingsHref}
            severity={paymentBanner.severity}
          />
        )}
        {env.NEXT_PUBLIC_PREVIEW_PR_URL && (
          <PreviewDeploymentBanner prUrl={env.NEXT_PUBLIC_PREVIEW_PR_URL} />
        )}
      </div>
      {versionUpdatePrompt.isVisible && (
        <VersionUpdateBanner
          onReload={versionUpdatePrompt.reload}
          onDismiss={versionUpdatePrompt.dismiss}
        />
      )}
      <div className="pt-banner-offset flex min-h-0 flex-1">{children}</div>
    </div>
  );
}

function ConnectedAppSidebar({
  navItems,
  secondaryNavItems,
  user,
  userMenuItems,
  isLangfuseCloud,
  routerProjectId,
}: {
  navItems: GroupedNavigation;
  secondaryNavItems: GroupedNavigation;
  user: ComponentProps<typeof AppSidebar>["user"];
  userMenuItems: ComponentProps<typeof AppSidebar>["userMenuItems"];
  isLangfuseCloud: boolean;
  routerProjectId?: string;
}) {
  const { isMobile } = useSidebar();
  const uiCustomization = useUiCustomization();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(routerProjectId);
  const session = useSession();
  const { organization, project } = useQueryProjectOrOrganization();
  const canCreateProjects = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:create",
  });
  const versionState = useSidebarVersionState({ isLangfuseCloud });
  const notificationState = useSidebarNotificationState();

  return (
    <AppSidebar
      navItems={navItems}
      secondaryNavItems={secondaryNavItems}
      user={user}
      userMenuItems={userMenuItems}
      isMobile={isMobile}
      logo={{
        lightModeHref: uiCustomization?.logoLightModeHref,
        darkModeHref: uiCustomization?.logoDarkModeHref,
      }}
      versionState={versionState}
      v4UpgradeUiEnabled={v4UpgradeUiEnabled}
      notificationState={notificationState}
      organization={
        organization ? { id: organization.id, name: organization.name } : null
      }
      project={project ? { id: project.id, name: project.name } : null}
      organizations={session.data?.user?.organizations ?? null}
      canCreateOrganizations={
        session.data?.user?.canCreateOrganizations ?? false
      }
      canCreateProjects={canCreateProjects}
      showDemoBadge={Boolean(
        env.NEXT_PUBLIC_DEMO_ORG_ID &&
        env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
        routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
        isLangfuseCloud,
      )}
    />
  );
}

/** useProjectCookie pings the visit beacon so the project sentinel and `/` can route the user back here. */
function useProjectCookie(router: NextRouter) {
  const projectId = router.query.projectId;
  useEffect(() => {
    if (typeof projectId !== "string") return;
    fetch(`/api/project/${encodeURIComponent(projectId)}/visit`, {
      method: "POST",
    }).catch(() => {});
  }, [projectId]);
}
