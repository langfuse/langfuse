import { BotMessageSquare } from "lucide-react";

import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";

export const InAppAiAgentButton = () => {
  const { isAvailable, open, openAssistant, setOpen } = useInAppAiAgent();

  if (!isAvailable) {
    return null;
  }

  return (
    <SidebarMenuButton
      data-ignore-outside-interaction
      isActive={open}
      onClick={() => {
        if (open) {
          setOpen(false);
          return;
        }

        openAssistant("sidebar");
      }}
    >
      <BotMessageSquare className="h-4 w-4" />
      Assistant
    </SidebarMenuButton>
  );
};
