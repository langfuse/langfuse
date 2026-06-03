import { Bot } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

import { SidebarMenuButton } from "@/src/components/ui/sidebar";
import { ControlledInAppAgentWindow } from "@/src/features/in-app-agent/components";
import { useInAppAiAgent } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { cn } from "@/src/utils/tailwind";

export const InAppAiAgentButton = () => {
  const { isAvailable, open, setOpen, isExpanded, setIsExpanded } =
    useInAppAiAgent();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousPanelRectRef = useRef<DOMRect | null>(null);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

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
          transform: `translate(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px) scale(${previousRect.width / nextRect.width}, ${previousRect.height / nextRect.height})`,
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

  if (!isAvailable) {
    return null;
  }

  return (
    <>
      <SidebarMenuButton
        ref={buttonRef}
        isActive={open}
        onClick={() => {
          updateAnchorStyle();
          setOpen((currentOpen) => !currentOpen);
        }}
      >
        <Bot className="h-4 w-4" />
        AI Assistant
      </SidebarMenuButton>
      {open && portalContainer
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                "fixed z-50 origin-top-left",
                isExpanded
                  ? "inset-x-3 top-[calc(var(--banner-offset)+0.75rem)] bottom-3"
                  : "bottom-2",
              )}
              style={isExpanded ? undefined : anchorStyle}
            >
              <ControlledInAppAgentWindow
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
    </>
  );
};
