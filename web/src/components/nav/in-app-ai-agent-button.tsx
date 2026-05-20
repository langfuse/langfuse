import { Bot } from "lucide-react";

import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

export const InAppAiAgentButton = () => {
  const { isAvailable, setOpen } = useInAppAiAgent();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();

  if (!isAvailable) {
    return null;
  }

  const toggleInAppAiAgent = () => {
    setSupportDrawerOpen(false);
    setOpen((currentOpen) => !currentOpen);
  };

  return (
    <SidebarMenuButton
      isActive={false}
      onClick={() => {
        if (isMobile) {
          setOpenMobileSidebar(false);
          setTimeout(() => {
            // push to next tick to avoid flickering when hiding sidebar on mobile
            toggleInAppAiAgent();
          }, 1);
          return;
        }

        toggleInAppAiAgent();
      }}
    >
      <Bot className="h-4 w-4" />
      AI Assistant
    </SidebarMenuButton>
  );
};
