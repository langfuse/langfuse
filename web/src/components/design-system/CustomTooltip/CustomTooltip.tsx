"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from "@floating-ui/react";
import * as React from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";

type CustomTooltipProps = {
  children: (controls: {
    getTriggerProps: () => ReturnType<
      ReturnType<typeof useInteractions>["getReferenceProps"]
    >;
  }) => React.ReactNode;
  content: React.ReactElement;
  delay?: number;
  hoverableContent?: boolean;
  placement?: Placement;
};

function CustomTooltip({
  children,
  content,
  delay = 700,
  hoverableContent = true,
  placement = "top",
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
    delay: { open: delay, close: 0 },
    handleClose: hoverableContent ? safePolygon() : undefined,
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      {children({
        getTriggerProps: () =>
          getReferenceProps({
            ref: refs.setReference,
          }),
      })}
      {isOpen ? (
        <FloatingPortal root={layerContainer}>
          <div
            ref={refs.setFloating}
            className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 max-w-xs overflow-hidden rounded-md border px-3 py-1.5 text-sm shadow-md"
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
