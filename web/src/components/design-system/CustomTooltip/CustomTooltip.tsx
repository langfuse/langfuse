"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  size,
  useDismiss,
  useClick,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
    useRole,
  type Placement,
} from "@floating-ui/react";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { cn } from "@/src/utils/tailwind";

const tooltipVariants = cva(
  "bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 max-w-xs rounded-md border text-sm shadow-md",
  {
    variants: {
      padding: { default: "px-3 py-1.5", uniform: "p-2" },
      overflow: {
        hidden: "overflow-hidden",
        scroll: "overflow-x-hidden overflow-y-auto overscroll-contain",
      },
    },
  },
);

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
  padding?: NonNullable<VariantProps<typeof tooltipVariants>["padding"]>;
  overflow?: NonNullable<VariantProps<typeof tooltipVariants>["overflow"]>;
  activation?: "hover" | "hover-and-click";
  size?: "default" | "wide";
  triggerRef?: React.Ref<HTMLElement>;
  disabled?: boolean;
};

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(value);
      } else if (ref) {
        ref.current = value;
      }
    });
  };
}

function CustomTooltip({
  children,
  content,
  delay = 150,
  hoverableContent = true,
  placement = "top",
  padding = "default",
  overflow = "hidden",
  activation = "hover",
  size: tooltipSize = "default",
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
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8 }),
      ...(overflow === "scroll"
        ? [
            size({
              padding: 8,
              apply({ availableHeight, elements }) {
                elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
              },
            }),
          ]
        : []),
    ],
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

  return (
    <>
      {children({
        getTriggerProps: (props = {}) => {
            return getReferenceProps({
              ...props,
              ref: mergeRefs(props.ref, triggerRef, refs.setReference),
          });
        },
      })}
      {isOpen && !disabled ? (
        <FloatingPortal root={layerContainer}>
          <div
            ref={refs.setFloating}
            className={cn(
                tooltipVariants({ padding, overflow }),
                tooltipSize === "wide" && "max-w-[calc(100vw-2rem)]",
              !hoverableContent && "pointer-events-none",
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
