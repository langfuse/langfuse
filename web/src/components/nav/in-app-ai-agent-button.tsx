import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { ControlledInAppAgentWindow } from "@/src/ee/features/in-app-agent/components";
import {
  InAppAgentWindowShell,
  useInAppAgentWindowShellPanelControl,
} from "@/src/ee/features/in-app-agent/components/InAppAgentWindowShell";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

const IN_APP_AI_AGENT_WINDOW_Z_INDEX = 51;

export const InAppAiAgentButton = () => {
  const { organization } = useQueryProjectOrOrganization();
  const { isAvailable, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const floatingPanelHandle = useInAppAgentWindowShellPanelControl({
    anchorRef: buttonRef,
  });

  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  useLayoutEffect(() => {
    const previousRect = previousPanelRectRef.current;
    const panel = panelRef.current;

    previousPanelRectRef.current = null;

    if (!previousRect || !panel) {
      return;
    }

    const nextRect = panel.getBoundingClientRect();

    panel.animate(
      [
        {
          transform: `translate(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px) scale(${nextRect.width > 0 ? previousRect.width / nextRect.width : 1}, ${nextRect.height > 0 ? previousRect.height / nextRect.height : 1})`,
        },
        { transform: "translate(0, 0) scale(1, 1)" },
      ],
      {
        duration: 180,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
  }, [isExpanded]);

  useLayoutEffect(() => {
    if (
      !open ||
      !portalContainer ||
      isExpanded ||
      floatingPanelHandle.geometry
    ) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle, isExpanded, open, portalContainer]);

  if (!isAvailable || !hasInAppAgentEntitlement) {
    return null;
  }

  const handleClick = () => {
    if (organization && !organization.aiFeaturesEnabled) {
      setSupportDrawerOpen(false);
      setEnableDialogOpen(true);
      return;
    }

    setSupportDrawerOpen(false);
    setOpen((currentOpen) => {
      const nextOpen = !currentOpen;

      if (nextOpen) {
        floatingPanelHandle.resetGeometry();
      }

      return nextOpen;
    });
  };

  return (
    <>
      <SidebarMenuButton ref={buttonRef} isActive={open} onClick={handleClick}>
        <BotMessageSquare className="h-4 w-4" />
        Assistant
      </SidebarMenuButton>
      {open && portalContainer
        ? createPortal(
            <InAppAgentWindowShell
              floatingPanelHandle={floatingPanelHandle}
              isExpanded={isExpanded}
              panelRef={panelRef}
              zIndex={IN_APP_AI_AGENT_WINDOW_Z_INDEX}
            >
              {({ isHeaderDragHandleEnabled }) => (
                <ControlledInAppAgentWindow
                  isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
                  zIndex={IN_APP_AI_AGENT_WINDOW_Z_INDEX}
                  isExpanded={isExpanded}
                  onExpandedChange={(nextIsExpanded) => {
                    previousPanelRectRef.current =
                      panelRef.current?.getBoundingClientRect() ?? null;
                    setIsExpanded(nextIsExpanded);
                  }}
                  onClose={() => {
                    floatingPanelHandle.clearGeometry();
                    setOpen(false);
                  }}
                />
              )}
            </InAppAgentWindowShell>,
            portalContainer,
          )
        : null}
      <Dialog open={enableDialogOpen} onOpenChange={setEnableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI features are disabled</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AIFeaturesDisabledNotice organizationId={organization?.id}>
              The assistant requires AI features to be enabled for this
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
