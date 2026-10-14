import { LifeBuoy } from "lucide-react";
import {
  SidebarMenuButton,
  useSidebar,
} from "@/src/app/design-system/legacy-primitives/sidebar";
import { useSupportDrawer } from "@/src/app/support";
import { useV4MigrationPanel } from "@/src/migrations/v4/upgrade-experience/V4MigrationPanelProvider";
import { useInAppAiAgent } from "@/src/ai/assistant";

export const SupportButton = () => {
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { setOpen: setMigrationPanelOpen } = useV4MigrationPanel();
  const { setOpen: setAiAgentOpen } = useInAppAiAgent();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();

  return (
    <SidebarMenuButton
      onClick={() => {
        if (isMobile) {
          setOpenMobileSidebar(false);
        }
        setTimeout(() => {
          // push to next tick to avoid flickering when hiding sidebar on mobile
          setAiAgentOpen(false);
          setMigrationPanelOpen(false);
          setSupportDrawerOpen(true);
        }, 1);
      }}
    >
      <LifeBuoy className="icon-base" />
      Support
    </SidebarMenuButton>
  );
};
