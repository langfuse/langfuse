import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { AIFeaturesDisabledNotice } from "@/src/features/organizations/components/AIFeaturesDisabledNotice";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";
import { cn } from "@/src/utils/tailwind";

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
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);

  const updateAnchorStyle = () => {
    const button = buttonRef.current;

    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();

    setAnchorStyle({
      left: rect.right - 6,
    });
  };

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

  useEffect(() => {
    if (!open || isExpanded) {
      return;
    }

    updateAnchorStyle();

    window.addEventListener("resize", updateAnchorStyle);
    window.addEventListener("scroll", updateAnchorStyle, true);

    return () => {
      window.removeEventListener("resize", updateAnchorStyle);
      window.removeEventListener("scroll", updateAnchorStyle, true);
    };
  }, [isExpanded, open]);

  if (!isAvailable || !hasInAppAgentEntitlement) {
    return null;
  }

  const handleClick = () => {
    if (organization && !organization.aiFeaturesEnabled) {
      setSupportDrawerOpen(false);
      setEnableDialogOpen(true);
      return;
    }

    updateAnchorStyle();
    setSupportDrawerOpen(false);
    setOpen((currentOpen) => !currentOpen);
  };

  return (
    <>
      <SidebarMenuButton ref={buttonRef} isActive={open} onClick={handleClick}>
        <BotMessageSquare className="h-4 w-4" />
        Assistant
      </SidebarMenuButton>
      {open && portalContainer
        ? createPortal(
            <div
              ref={panelRef}
              data-ignore-outside-interaction
              className={cn(
                "fixed origin-top-left",
                isExpanded
                  ? "inset-x-3 top-[calc(var(--banner-offset)+0.75rem)] bottom-3"
                  : "bottom-2",
              )}
              style={
                isExpanded
                  ? { zIndex: IN_APP_AI_AGENT_WINDOW_Z_INDEX }
                  : { ...anchorStyle, zIndex: IN_APP_AI_AGENT_WINDOW_Z_INDEX }
              }
            >
              <ControlledInAppAgentWindow
                zIndex={IN_APP_AI_AGENT_WINDOW_Z_INDEX}
                isExpanded={isExpanded}
                onExpandedChange={(nextIsExpanded) => {
                  previousPanelRectRef.current =
                    panelRef.current?.getBoundingClientRect() ?? null;
                  setIsExpanded(nextIsExpanded);
                }}
                onClose={() => setOpen(false)}
              />
            </div>,
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
