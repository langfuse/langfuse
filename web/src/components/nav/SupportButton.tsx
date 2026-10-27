import { LifeBuoy } from "@langfuse/icons";
import { SidebarNavItem } from "@/src/components/nav/SidebarNavItem";
import { useAppNavigation } from "@/src/components/nav/AppNavigationProvider";
import { useSupportDrawer } from "@/src/features/support-chat";
import { useV4MigrationPanel } from "@/src/features/v4-migration/V4MigrationPanelProvider";
import { useInAppAiAgent } from "@/src/features/in-app-agent";

export const SupportButton = () => {
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const appNavigation = useAppNavigation();

  return (
    <SidebarNavItem.Button
      leading={<LifeBuoy size="base" />}
      label="Support"
      onClick={() => {
        appNavigation?.closeTransientNavigation();
        setTimeout(() => {
          // push to next tick to avoid flickering when hiding sidebar on mobile
          setAiAgentOpen(false);
          setMigrationPanelOpen(false);
          setSupportDrawerOpen(true);
        }, 1);
      }}
    />
  );
};
