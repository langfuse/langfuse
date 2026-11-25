import motion from "./sidebarMotion.module.css";
import { cn } from "@/src/utils/tailwind";
import { useRouter } from "next/router";
import { type RouteGroup } from "@/src/components/layouts/routes";
import { type NavigationItem } from "@/src/components/layouts/utilities/routes";
import {
  SidebarNotifications,
  getActiveSidebarNotifications,
} from "@/src/components/nav/SidebarNotifications";
import { type UserNavigationItem } from "@/src/components/nav/UserMenuItems";
import { useSidebarNotificationState } from "@/src/components/nav/useSidebarNotificationState";
import { useSidebarVersionState } from "@/src/components/nav/useSidebarVersionState";
import { env } from "@/src/env.mjs";
import { SidebarAccountButton } from "@/src/features/app-shell/components/SidebarAccountButton";
import { SidebarDemoNotice } from "@/src/features/app-shell/components/SidebarDemoNotice";
import { SidebarNavigation } from "@/src/features/app-shell/components/SidebarNavigation";
import { SidebarPanel } from "@/src/features/app-shell/components/SidebarPanel";
import { SidebarOrganizationHeader } from "@/src/features/app-shell/components/SidebarOrganizationHeader";
import {
  SidebarUserMenu,
  type SidebarUser,
} from "@/src/features/app-shell/components/SidebarUserMenu";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

type GroupedNavigationItems = {
  ungrouped: NavigationItem[];
  grouped: Partial<Record<RouteGroup, NavigationItem[]>> | null;
};

/** The app sidebar's content: organization, navigation, and account. */
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
  const isCollapsed = surface === "collapsed";
  const router = useRouter();
  const routerProjectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;
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
      <SidebarOrganizationHeader />
      {isDemoProject && (
        <div
          className={motion.expandedSection}
          data-collapsed={isCollapsed}
          data-sidebar-expanded-only=""
          inert={isCollapsed}
        >
          <div className={cn(motion.sectionContent, motion.label)}>
            <SidebarPanel.Section>
              <SidebarDemoNotice />
            </SidebarPanel.Section>
          </div>
        </div>
      )}
      <SidebarPanel.Body>
        <SidebarNavigation label="Main" items={mainNavigation} />
        <SidebarPanel.Spacer />
        {activeNotifications.length > 0 && (
          <div
            className={motion.expandedSection}
            data-collapsed={isCollapsed}
            data-sidebar-expanded-only=""
            inert={isCollapsed}
          >
            <div className={cn(motion.sectionContent, motion.label)}>
              <div className="px-2">
                <SidebarNotifications
                  state={notificationState}
                  activeNotifications={activeNotifications}
                />
              </div>
            </div>
          </div>
        )}
        <SidebarNavigation label="More" items={secondaryNavigation} />
      </SidebarPanel.Body>
      <SidebarPanel.Footer>
        <SidebarUserMenu
          user={user}
          items={userMenuItems}
          versionState={versionState}
          side={surface === "mobile" ? "top" : "right"}
        >
          {({ Trigger }) => (
            <Trigger asChild>
              <SidebarAccountButton
                user={user}
                surface={surface}
                versionState={versionState}
              />
            </Trigger>
          )}
        </SidebarUserMenu>
      </SidebarPanel.Footer>
    </SidebarPanel>
  );
}
