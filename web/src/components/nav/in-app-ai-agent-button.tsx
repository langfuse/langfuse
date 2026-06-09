import { useState } from "react";
import { Bot } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { SidebarMenuButton, useSidebar } from "@/src/components/ui/sidebar";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

export const InAppAiAgentButton = () => {
  const { organization } = useQueryProjectOrOrganization();
  const { isAvailable, setOpen } = useInAppAiAgent();
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const { isMobile, setOpenMobile: setOpenMobileSidebar } = useSidebar();
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  if (!isAvailable) {
    return null;
  }

  const toggleInAppAiAgent = () => {
    setSupportDrawerOpen(false);
    setOpen((currentOpen) => !currentOpen);
  };

  const handleClick = () => {
    if (isMobile) {
      setOpenMobileSidebar(false);
    }

    if (organization && !organization.aiFeaturesEnabled) {
      setSupportDrawerOpen(false);
      setEnableDialogOpen(true);
      return;
    }

    if (isMobile) {
      setTimeout(() => {
        // push to next tick to avoid flickering when hiding sidebar on mobile
        toggleInAppAiAgent();
      }, 1);
      return;
    }

    toggleInAppAiAgent();
  };

  return (
    <>
      <SidebarMenuButton isActive={false} onClick={handleClick}>
        <Bot className="h-4 w-4" />
        AI Assistant
      </SidebarMenuButton>

      <Dialog open={enableDialogOpen} onOpenChange={setEnableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI features are disabled</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AIFeaturesDisabledNotice organizationId={organization?.id}>
              The AI assistant requires AI features to be enabled for this
              organization.
            </AIFeaturesDisabledNotice>
          </DialogBody>
          <DialogFooter>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEnableDialogOpen(false)}
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
