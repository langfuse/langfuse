"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useClick,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  type Placement,
} from "@floating-ui/react";
import * as React from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { cn } from "@/src/utils/tailwind";

type CustomTooltipProps = {
  children: (controls: {
    getTriggerProps: (
      props?: React.HTMLProps<HTMLElement>,
    ) => ReturnType<ReturnType<typeof useInteractions>["getReferenceProps"]>;
  }) => React.ReactNode;
  content: React.ReactElement;
  delay?: number;
  hoverableContent?: boolean;
  placement?: Placement;
  activation?: "hover" | "hover-and-click";
  size?: "default" | "wide";
  triggerRef?: React.Ref<HTMLElement>;
  disabled?: boolean;
};

function CustomTooltip({
  children,
  content,
  delay = 700,
  hoverableContent = true,
  placement = "top",
  activation = "hover",
  size = "default",
  triggerRef,
  disabled = false,
}: CustomTooltipProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const layerContainer = useLayerContainer("tooltip");
  const { context, floatingStyles, refs } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    strategy: "fixed",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    transform: false,
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    enabled: !disabled,
    delay: { open: delay, close: 0 },
    handleClose: hoverableContent ? safePolygon() : undefined,
  });
  const focus = useFocus(context, { enabled: !disabled });
  const click = useClick(context, {
    enabled: !disabled && activation === "hover-and-click",
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ]);
  const referenceRef = useMergeRefs([refs.setReference, triggerRef]);

  return (
    <>
      {children({
        getTriggerProps: (props) =>
          getReferenceProps({
            ...props,
            ref: referenceRef,
          }),
      })}
      {isOpen && !disabled ? (
        <FloatingPortal root={layerContainer}>
          <div
            ref={refs.setFloating}
            className={cn(
              "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 overflow-hidden rounded-md border px-3 py-1.5 text-sm shadow-md",
              size === "wide" ? "max-w-[calc(100vw-2rem)]" : "max-w-xs",
            )}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            {content}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export { CustomTooltip };
