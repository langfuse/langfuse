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
  size,
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

function FloatingController({
  children,
  renderContent,
  open,
  onOpenChange,
  openDelay = 700,
  closeDelay = 300,
  placement = "bottom",
  sideOffset = 4,
  collisionPadding = 8,
  hideWhenDetached = false,
  enabled = true,
  role: overlayRole = "dialog",
  hoverableContent = true,
  scrollable = false,
  onWheel,
  onTouchMove,
  ...props
}: Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children" | "content" | "defaultValue" | "className" | "style"
> & {
  children: (controls: {
    getTriggerProps: (
      props?: React.HTMLProps<HTMLElement>,
    ) => ReturnType<ReturnType<typeof useInteractions>["getReferenceProps"]>;
  }) => React.ReactNode;
  renderContent: (
    props: React.HTMLProps<HTMLDivElement> & {
      "data-state": "open";
      "data-side": string;
    },
  ) => React.ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openDelay?: number;
  closeDelay?: number;
  placement?: Placement;
  sideOffset?: number;
  collisionPadding?: number;
  hideWhenDetached?: boolean;
  enabled?: boolean;
  role?: "tooltip" | "dialog";
  hoverableContent?: boolean;
  scrollable?: boolean;
}) {
  const isOpen = enabled && open;
  const layerContainer = useLayerContainer(
    overlayRole === "tooltip" ? "tooltip" : "popover",
  );
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
      ...(scrollable
        ? [
            size({
              padding: collisionPadding,
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
    enabled,
    delay: { open: openDelay, close: closeDelay },
    handleClose: hoverableContent ? safePolygon() : undefined,
    move: false,
  });
  const focus = useFocus(context, { enabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: overlayRole });
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
            disabled={overlayRole === "tooltip"}
            modal={false}
            initialFocus={-1}
          >
            {renderContent({
              ...getFloatingProps({
                ...props,
                onWheel:
                  overlayRole === "dialog"
                    ? stopScrollPropagation(onWheel)
                    : onWheel,
                onTouchMove:
                  overlayRole === "dialog"
                    ? stopScrollPropagation(onTouchMove)
                    : onTouchMove,
              }),
              ref: refs.setFloating,
              "data-state": "open",
              "data-side": resolvedPlacement.split("-")[0] ?? resolvedPlacement,
              style: {
                ...floatingStyles,
                ...(middlewareData.hide?.referenceHidden
                  ? { visibility: "hidden" }
                  : {}),
              },
            })}
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export { FloatingController };
