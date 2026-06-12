import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { BotMessageSquare } from "lucide-react";

import { useMovableResizablePanelGeometry } from "@/src/components/movable-resizable-panel";
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
  getInitialInAppAgentWindowShellGeometry,
  InAppAgentWindowShell,
} from "@/src/ee/features/in-app-agent/components/InAppAgentWindowShell";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

const IN_APP_AI_AGENT_WINDOW_Z_INDEX = 51;

export const InAppAiAgentButton = () => {
  const session = useSession();
  const { organization } = useQueryProjectOrOrganization();
  const { isAvailable, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const isInAppAgentEnabled =
    session.data?.user?.featureFlags.inAppAgent === true;
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const getInitialFloatingPanelGeometry = () => {
    const button = buttonRef.current;

    return getInitialInAppAgentWindowShellGeometry({
      anchorRect: button?.getBoundingClientRect(),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    });
  };

  const floatingPanelGeometry = useMovableResizablePanelGeometry({
    getInitialGeometry: getInitialFloatingPanelGeometry,
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
      floatingPanelGeometry.geometry
    ) {
      return;
    }

    floatingPanelGeometry.initializeGeometry();
  }, [floatingPanelGeometry, isExpanded, open, portalContainer]);

  if (!isAvailable || !hasInAppAgentEntitlement || !isInAppAgentEnabled) {
    return null;
  }

  const activeFloatingPanelGeometry =
    open && portalContainer && !isExpanded
      ? floatingPanelGeometry.geometry
      : null;

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
        floatingPanelGeometry.resetGeometry();
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
              floatingGeometry={activeFloatingPanelGeometry}
              isExpanded={isExpanded}
              panelRef={panelRef}
              zIndex={IN_APP_AI_AGENT_WINDOW_Z_INDEX}
              onPositionChange={floatingPanelGeometry.setPosition}
              onSizeChange={floatingPanelGeometry.setSize}
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
                    floatingPanelGeometry.clearGeometry();
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
