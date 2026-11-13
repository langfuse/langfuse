import Link from "next/link";
import { useSession } from "next-auth/react";
import { X } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { AppSidebar } from "@/src/components/nav/AppSidebar/AppSidebar";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useAppShellSidebarActions } from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { SidebarPanel } from "./SidebarPanel";
import { cn } from "@/src/utils/tailwind";
import motion from "./sidebarMotion.module.css";
import styles from "./SidebarOrganizationHeader.module.css";

/** The existing organization selector stays at the top in every sidebar layout. */
export function SidebarOrganizationHeader() {
  const { organization } = useQueryProjectOrOrganization();
  const session = useSession();
  const customization = useUiCustomization();
  const surface = useSidebarSurface();
  const { setMobileOpen } = useAppShellSidebarActions();
  const isCollapsed = surface === "collapsed";

  return (
    <SidebarPanel.Header>
      <span className={styles.mobileClose}>
        <IconButton
          icon={X}
          label="Close menu"
          size="sm"
          onClick={() => setMobileOpen(false)}
        />
      </span>
      <Link
        href={organization ? `/organization/${organization.id}` : "/"}
        aria-label={
          organization ? `${organization.name} projects` : "Langfuse home"
        }
        className={cn("ph-no-capture", styles.logo)}
      >
        {customization?.logoLightModeHref && customization.logoDarkModeHref ? (
          <>
            <img
              src={customization.logoLightModeHref}
              alt="Logo"
              className="size-7 object-contain dark:hidden"
            />
            <img
              src={customization.logoDarkModeHref}
              alt="Logo"
              className="hidden size-7 object-contain dark:block"
            />
          </>
        ) : (
          <LangfuseIcon size={24} />
        )}
      </Link>
      <div
        className={cn(styles.selector, motion.label)}
        data-sidebar-expanded-only=""
        inert={isCollapsed}
      >
        {organization && (
          <AppSidebar.OrganizationSwitcher
            organization={organization}
            organizations={session.data?.user?.organizations ?? null}
            canCreateOrganizations={
              session.data?.user?.canCreateOrganizations === true
            }
          />
        )}
      </div>
    </SidebarPanel.Header>
  );
}
