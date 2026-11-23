import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useRouter } from "next/router";
import { LayoutGrid } from "@langfuse/icons";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";

const OVERVIEW_PATHNAMES = new Set([
  "/organizations",
  "/organization/[organizationId]",
]);

/**
 * The workspace's projects overview, reachable from every page: the current
 * organization's overview, or all organizations outside of one.
 */
export function SidebarOverviewLink() {
  const router = useRouter();
  const isCollapsed = useSidebarSurface() === "collapsed";
  const { organization } = useQueryProjectOrOrganization();

  return (
    <SidebarNavItem
      isCollapsed={isCollapsed}
      href={
        organization ? `/organization/${organization.id}` : "/organizations"
      }
      isActive={OVERVIEW_PATHNAMES.has(router.pathname)}
      opensInNewTab={false}
      leading={<LayoutGrid size="base" />}
      label="Overview"
    />
  );
}
