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

function buildMiddleware({
  sideOffset,
  collisionPadding,
  hideWhenDetached,
  isScrollable,
}: Required<
  Pick<
    React.ComponentProps<typeof FloatingController>,
    "sideOffset" | "collisionPadding" | "hideWhenDetached" | "isScrollable"
  >
>) {
  return [
    offset(sideOffset),
    flip({ padding: collisionPadding }),
    shift({ padding: collisionPadding }),
    ...(hideWhenDetached ? [hide({ padding: collisionPadding })] : []),
    ...(isScrollable
      ? [
          size({
            padding: collisionPadding,
            apply({ availableHeight, elements }) {
              elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
            },
          }),
        ]
      : []),
  ];
}

function useStableTriggerRef(
  setReference: ReturnType<typeof useFloating>["refs"]["setReference"],
) {
  return React.useMemo(() => {
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
}

function getContentProps({
  getFloatingProps,
  setFloating,
  placement,
  floatingStyles,
  middlewareData,
  role,
  onWheel,
  onTouchMove,
  ...props
}: React.HTMLProps<HTMLDivElement> & {
  getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
  setFloating: ReturnType<typeof useFloating>["refs"]["setFloating"];
  placement: Placement;
  floatingStyles: ReturnType<typeof useFloating>["floatingStyles"];
  middlewareData: ReturnType<typeof useFloating>["middlewareData"];
  role: NonNullable<React.ComponentProps<typeof FloatingController>["role"]>;
}) {
  return {
    ...getFloatingProps({
      ...props,
      onWheel: role === "dialog" ? stopScrollPropagation(onWheel) : onWheel,
      onTouchMove:
        role === "dialog" ? stopScrollPropagation(onTouchMove) : onTouchMove,
    }),
    ref: setFloating,
    "data-state": "open" as const,
    "data-side": placement.split("-")[0] ?? placement,
    style: {
      ...floatingStyles,
      ...(middlewareData.hide?.referenceHidden
        ? { visibility: "hidden" as const }
        : {}),
    },
  };
}

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
  isScrollable = false,
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
  isScrollable?: boolean;
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
    middleware: buildMiddleware({
      sideOffset,
      collisionPadding,
      hideWhenDetached,
      isScrollable,
    }),
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
  const getTriggerRef = useStableTriggerRef(refs.setReference);

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
            {renderContent(
              getContentProps({
                ...props,
                getFloatingProps,
                setFloating: refs.setFloating,
                placement: resolvedPlacement,
                floatingStyles,
                middlewareData,
                role: overlayRole,
                onWheel,
                onTouchMove,
              }),
            )}
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

export { FloatingController };
