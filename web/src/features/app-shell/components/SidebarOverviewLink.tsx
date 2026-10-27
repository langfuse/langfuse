import { useRouter } from "next/router";
import { LayoutGrid } from "@langfuse/icons";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { useQueryProjectOrOrganization } from "@/src/features/projects";

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
  const { organization } = useQueryProjectOrOrganization();

  return (
    <SidebarNavItem
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
