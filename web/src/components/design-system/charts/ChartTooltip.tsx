"use client";

import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClientPoint,
  useFloating,
} from "@floating-ui/react";
import {
  useLayoutEffect,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";

export function ChartTooltip({
  children,
}: {
  children: (controller: {
    activeIndex: number | undefined;
    getReferenceProps: (data: {
      index: number;
      label: string;
      value: string;
      color: string;
      details?: { label: string; value: string }[];
    }) => {
      onPointerEnter: (event: PointerEvent<SVGElement>) => void;
      onPointerMove: (event: PointerEvent<SVGElement>) => void;
      onPointerLeave: () => void;
      onFocus: (event: FocusEvent<SVGElement>) => void;
      onBlur: () => void;
    };
  }) => ReactNode;
}) {
  const [activeTooltip, setActiveTooltip] = useState<{
    index: number;
    label: string;
    value: string;
    color: string;
    details?: { label: string; value: string }[];
    reference: SVGElement;
    clientPoint?: { x: number; y: number };
    placement: "left" | "right";
  }>();

  useLayoutEffect(() => {
    if (activeTooltip && !activeTooltip.reference.isConnected) {
      setActiveTooltip(undefined);
    }
  }, [activeTooltip, children]);

  const layerContainer = useLayerContainer("tooltip");
  const { context, floatingStyles, refs } = useFloating({
    elements: { reference: activeTooltip?.reference },
    placement: activeTooltip?.placement ?? "right",
    strategy: "fixed",
    middleware: [offset(12), flip(), shift({ padding: 8 })],
    transform: false,
    whileElementsMounted: autoUpdate,
  });
  useClientPoint(context, {
    enabled: activeTooltip?.clientPoint !== undefined,
    x: activeTooltip?.clientPoint?.x,
    y: activeTooltip?.clientPoint?.y,
  });

  const getReferenceProps = (data: {
    index: number;
    label: string;
    value: string;
    color: string;
    details?: { label: string; value: string }[];
  }) => {
    const showAtPointer = (event: PointerEvent<SVGElement>) => {
      const { clientX, clientY, currentTarget } = event;
      const chartBounds =
        currentTarget.ownerSVGElement?.getBoundingClientRect();
      setActiveTooltip({
        ...data,
        reference: currentTarget,
        clientPoint: { x: clientX, y: clientY },
        placement:
          chartBounds && clientX < chartBounds.left + chartBounds.width / 2
            ? "left"
            : "right",
      });
    };

    return {
      onPointerEnter: showAtPointer,
      onPointerMove: showAtPointer,
      onPointerLeave: () => setActiveTooltip(undefined),
      onFocus: (event: FocusEvent<SVGElement>) => {
        const sliceBounds = event.currentTarget.getBoundingClientRect();
        const chartBounds =
          event.currentTarget.ownerSVGElement?.getBoundingClientRect();
        setActiveTooltip({
          ...data,
          reference: event.currentTarget,
          placement:
            chartBounds &&
            sliceBounds.left + sliceBounds.width / 2 <
              chartBounds.left + chartBounds.width / 2
              ? "left"
              : "right",
        });
      },
      onBlur: () => setActiveTooltip(undefined),
    };
  };

  return (
    <>
      {children({ activeIndex: activeTooltip?.index, getReferenceProps })}
      {activeTooltip ? (
        <FloatingPortal root={layerContainer}>
          <div
            ref={refs.setFloating}
            role="tooltip"
            className="border-border/50 bg-background pointer-events-none z-50 grid min-w-32 gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl"
            style={floatingStyles}
          >
            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 10 10"
                className="size-2.5 shrink-0"
                aria-hidden="true"
              >
                <rect
                  width="10"
                  height="10"
                  rx="2"
                  fill={activeTooltip.color}
                />
              </svg>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-x-3 leading-tight">
                <span
                  className="text-muted-foreground truncate"
                  title={activeTooltip.label}
                >
                  {activeTooltip.label}
                </span>
                <span className="text-foreground shrink-0 font-mono font-bold whitespace-nowrap tabular-nums">
                  {activeTooltip.value}
                </span>
              </div>
            </div>
            {activeTooltip.details?.map((detail, index) => (
              <div
                key={`${detail.label}-${index}`}
                className="flex min-w-0 items-center justify-between gap-x-3 pl-4 leading-tight"
              >
                <span
                  className="text-muted-foreground truncate"
                  title={detail.label}
                >
                  {detail.label}
                </span>
                <span className="text-foreground shrink-0 font-mono whitespace-nowrap tabular-nums">
                  {detail.value}
                </span>
              </div>
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
