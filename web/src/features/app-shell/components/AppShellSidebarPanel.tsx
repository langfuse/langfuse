import Link from "next/link";
import { Info } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { useRouter } from "next/router";
import { LangfuseLogo } from "@/src/components/design-system/LangfuseLogo/LangfuseLogo";
import { type RouteGroup } from "@/src/components/layouts/routes";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";
import {
  SidebarNotifications,
  getActiveSidebarNotifications,
} from "@/src/components/nav/SidebarNotifications";
import { type UserNavigationItem } from "@/src/components/nav/UserMenuItems";
import { VersionBadge } from "@/src/components/nav/VersionBadge";
import { VersionMenu } from "@/src/components/nav/VersionMenu";
import { useSidebarNotificationState } from "@/src/components/nav/useSidebarNotificationState";
import { useSidebarVersionState } from "@/src/components/nav/useSidebarVersionState";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { env } from "@/src/env.mjs";
import { SidebarAccountButton } from "@/src/features/app-shell/components/SidebarAccountButton";
import { SidebarDemoNotice } from "@/src/features/app-shell/components/SidebarDemoNotice";
import { SidebarNavigation } from "@/src/features/app-shell/components/SidebarNavigation";
import { SidebarOverviewLink } from "@/src/features/app-shell/components/SidebarOverviewLink";
import { SidebarPanel } from "@/src/features/app-shell/components/SidebarPanel";
import { SidebarExpansionToggle } from "@/src/features/app-shell/components/SidebarExpansionToggle";
import {
  SidebarUserMenu,
  type SidebarUser,
} from "@/src/features/app-shell/components/SidebarUserMenu";
import { SidebarWorkspaceSwitcher } from "@/src/features/app-shell/components/SidebarWorkspaceSwitcher";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

type GroupedNavigationItems = {
  ungrouped: NavigationItem[];
  grouped: Partial<Record<RouteGroup, NavigationItem[]>> | null;
};

/** The workspace block owns the overview entry, so the route list does not repeat it. */
const WORKSPACE_BLOCK_ROUTE_IDS = new Set<NavigationItem["id"]>([
  "organizations-overview",
  "organization-overview",
]);

const withoutWorkspaceBlockRoutes = (
  navigation: GroupedNavigationItems,
): GroupedNavigationItems => ({
  ...navigation,
  ungrouped: navigation.ungrouped.filter(
    (item) => !WORKSPACE_BLOCK_ROUTE_IDS.has(item.id),
  ),
});

/** The app sidebar's content: brand, workspace switcher, navigation, and account. */
export function AppShellSidebarPanel({
  mainNavigation,
  secondaryNavigation,
  user,
  userMenuItems,
  isLangfuseCloud,
}: {
  mainNavigation: GroupedNavigationItems;
  secondaryNavigation: GroupedNavigationItems;
  user: SidebarUser;
  userMenuItems: UserNavigationItem[];
  isLangfuseCloud: boolean;
}) {
  const surface = useSidebarSurface();
  const isCollapsed = surface === "rail";
  const router = useRouter();
  const routerProjectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;
  const uiCustomization = useUiCustomization();
  const versionState = useSidebarVersionState({ isLangfuseCloud });
  const notificationState = useSidebarNotificationState();
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled(routerProjectId);
  const activeNotifications = v4UpgradeUiEnabled
    ? []
    : getActiveSidebarNotifications(notificationState.dismissedIds);
  const isDemoProject = Boolean(
    isLangfuseCloud &&
    env.NEXT_PUBLIC_DEMO_ORG_ID &&
    env.NEXT_PUBLIC_DEMO_PROJECT_ID &&
    routerProjectId === env.NEXT_PUBLIC_DEMO_PROJECT_ID,
  );

  return (
    <SidebarPanel>
      <SidebarPanel.Header>
        {isCollapsed ? (
          <SidebarExpansionToggle />
        ) : (
          <>
            <Link
              href="/"
              aria-label="Langfuse home"
              className="flex shrink-0 items-center"
            >
              <LangfuseLogo
                logoLightModeHref={uiCustomization?.logoLightModeHref}
                logoDarkModeHref={uiCustomization?.logoDarkModeHref}
              />
            </Link>
            <div
              className={
                surface === "sheet"
                  ? "mr-9 ml-auto flex min-w-0 items-center overflow-hidden"
                  : "ml-auto flex min-w-0 items-center overflow-hidden"
              }
            >
              <VersionMenu state={versionState}>
                {({ Trigger, triggerProps }) => (
                  <Trigger asChild>
                    <VersionBadge state={versionState} {...triggerProps} />
                  </Trigger>
                )}
              </VersionMenu>
            </div>
            {surface === "docked" && <SidebarExpansionToggle />}
          </>
        )}
      </SidebarPanel.Header>
      <SidebarPanel.Section>
        <div className="flex flex-col gap-1">
          <SidebarWorkspaceSwitcher />
          <SidebarOverviewLink />
        </div>
      </SidebarPanel.Section>
      {isDemoProject && !isCollapsed ? (
        <SidebarPanel.Section>
          <SidebarDemoNotice />
        </SidebarPanel.Section>
      ) : null}
      <SidebarPanel.Body>
        <SidebarNavigation
          label="Main"
          items={withoutWorkspaceBlockRoutes(mainNavigation)}
        />
        <SidebarPanel.Spacer />
        {activeNotifications.length > 0 && !isCollapsed ? (
          <div className="px-2">
            <SidebarNotifications
              state={notificationState}
              activeNotifications={activeNotifications}
            />
          </div>
        ) : null}
        <SidebarNavigation label="More" items={secondaryNavigation} />
      </SidebarPanel.Body>
      <SidebarPanel.Footer>
        {isCollapsed && (
          <div className="mb-1 flex justify-center">
            <VersionMenu state={versionState}>
              {({ Trigger, triggerProps }) => (
                <Trigger asChild>
                  <IconButton
                    icon={Info}
                    label="Version and updates"
                    size="sm"
                    {...triggerProps}
                  />
                </Trigger>
              )}
            </VersionMenu>
          </div>
        )}
        <SidebarUserMenu
          user={user}
          items={userMenuItems}
          side={surface === "sheet" ? "top" : "right"}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <SidebarAccountButton user={user} isCollapsed={isCollapsed} />
            </Trigger>
          )}
        </SidebarUserMenu>
      </SidebarPanel.Footer>
    </SidebarPanel>
  );
}
