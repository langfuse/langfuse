"use client";

import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  hide,
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
import { stopScrollPropagation } from "@/src/hooks/stopScrollPropagation";

type HoverCardControllerProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children" | "content" | "defaultValue" | "className" | "style"
> & {
  children: (controls: {
    getTriggerProps: (
      props?: React.HTMLProps<HTMLElement>,
    ) => ReturnType<ReturnType<typeof useInteractions>["getReferenceProps"]>;
  }) => React.ReactNode;
  // Content owns its sizing, padding, and scroll layout inside the portaled frame.
  content: React.ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openDelay?: number;
  closeDelay?: number;
  placement?: Placement;
  sideOffset?: number;
  collisionPadding?: number;
  hideWhenDetached?: boolean;
  enabled?: boolean;
};

function HoverCardController({
  children,
  content,
  open,
  onOpenChange,
  openDelay = 700,
  closeDelay = 300,
  placement = "bottom",
  sideOffset = 4,
  collisionPadding = 8,
  hideWhenDetached = false,
  enabled = true,
  onWheel,
  onTouchMove,
  ...props
}: HoverCardControllerProps) {
  const isOpen = enabled && open;
  const layerContainer = useLayerContainer("popover");
  const {
    context,
    floatingStyles,
    middlewareData,
    refs,
    placement: resolvedPlacement,
  } = useFloating({
    open: isOpen,
    onOpenChange,
    placement,
    strategy: "fixed",
    middleware: [
      offset(sideOffset),
      flip({ padding: collisionPadding }),
      shift({ padding: collisionPadding }),
      ...(hideWhenDetached ? [hide({ padding: collisionPadding })] : []),
    ],
    transform: false,
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    enabled,
    delay: { open: openDelay, close: closeDelay },
    handleClose: safePolygon(),
    move: false,
  });
  const focus = useFocus(context, { enabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps, getReferenceProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);
  const { setReference } = refs;
  const getTriggerRef = React.useMemo(() => {
    // Stable composed refs avoid detaching the trigger on every prop-getter call.
    const mergedRefs = new WeakMap<
      NonNullable<React.Ref<HTMLElement>>,
      React.RefCallback<HTMLElement>
    >();

    return (callerRef: React.Ref<HTMLElement> | undefined) => {
      if (!callerRef) return setReference;
      const cachedRef = mergedRefs.get(callerRef);
      if (cachedRef) return cachedRef;

      const mergedRef: React.RefCallback<HTMLElement> = (node) => {
        setReference(node);
        if (typeof callerRef === "function") {
          const cleanup = callerRef(node);
          return () => {
            setReference(null);
            if (cleanup) {
              cleanup();
            } else {
              callerRef(null);
            }
          };
        }

        callerRef.current = node;
        return () => {
          setReference(null);
          callerRef.current = null;
        };
      };
      mergedRefs.set(callerRef, mergedRef);
      return mergedRef;
    };
  }, [setReference]);

  return (
    <>
      {children({
        getTriggerProps: (triggerProps) =>
          getReferenceProps({
            ...triggerProps,
            ref: getTriggerRef(triggerProps?.ref),
          }),
      })}
      {isOpen ? (
        <FloatingPortal root={layerContainer}>
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
          >
            <div
              ref={refs.setFloating}
              aria-label="Preview"
              data-state="open"
              data-side={resolvedPlacement.split("-")[0]}
              className="animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 outline-hidden"
              style={{
                ...floatingStyles,
                ...(middlewareData.hide?.referenceHidden
                  ? { visibility: "hidden" }
                  : {}),
              }}
              {...getFloatingProps({
                ...props,
                onWheel: stopScrollPropagation(onWheel),
                onTouchMove: stopScrollPropagation(onTouchMove),
              })}
            >
              {content}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export { HoverCardController };
