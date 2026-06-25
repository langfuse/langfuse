import { useLayoutEffect, useRef, useState } from "react";
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
import { Layer } from "@/src/components/ui/layer";
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

export const InAppAiAgentButton = () => {
  const { organization } = useQueryProjectOrOrganization();
  const { isAvailable, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const hasInAppAgentEntitlement = useHasEntitlement("in-app-agent");
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const floatingPanelHandle = useInAppAgentWindowShellPanelControl({
    anchorRef: buttonRef,
  });

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
    if (!open || isExpanded || floatingPanelHandle.geometry) {
      return;
    }

    floatingPanelHandle.initializeGeometry();
  }, [floatingPanelHandle, isExpanded, open]);

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
      {open ? (
        // The assistant window lives in the `agent` overlay layer — a
        // <body>-level layer container that floats above page content but below
        // every transient overlay (dropdowns, dialogs, popovers, tooltips,
        // toasts) by DOM order alone. No z-index: layer ORDER stacks it (see
        // components/ui/layer.tsx). This replaces the old body portal + z-51,
        // which fought the nav-user dropdown's z-60 at <body> level.
        <Layer name="agent">
          <InAppAgentWindowShell
            floatingPanelHandle={floatingPanelHandle}
            isExpanded={isExpanded}
            panelRef={panelRef}
          >
            {({ isHeaderDragHandleEnabled }) => (
              <ControlledInAppAgentWindow
                isHeaderDragHandleEnabled={isHeaderDragHandleEnabled}
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
          </InAppAgentWindowShell>
        </Layer>
      ) : null}
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
