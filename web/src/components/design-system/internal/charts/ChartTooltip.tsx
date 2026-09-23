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
  Fragment,
  useLayoutEffect,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";

type TooltipItem = {
  label: string;
  value: string;
  color?: string;
};

type TooltipData = {
  index: number;
  heading?: string;
  focusPoint?: { x: number; y: number };
} & (
  | {
      type: "items";
      items: Array<TooltipItem & { id: string }>;
      emphasizedItemId?: string;
      label?: never;
      value?: never;
      color?: never;
      details?: never;
    }
  | {
      type: "primary";
      items?: never;
      label: string;
      value: string;
      color?: string;
      details?: Array<Omit<TooltipItem, "color">>;
      emphasizedItemId?: never;
    }
);

export function ChartTooltip({
  children,
}: {
  children: (controller: {
    activeIndex: number | undefined;
    getReferenceProps: (data: TooltipData) => {
      onPointerEnter: (event: PointerEvent<SVGElement>) => void;
      onPointerMove: (event: PointerEvent<SVGElement>) => void;
      onPointerLeave: () => void;
      onFocus: (event: FocusEvent<SVGElement>) => void;
      onBlur: () => void;
    };
  }) => ReactNode;
}) {
  const [activeTooltip, setActiveTooltip] = useState<
    TooltipData & {
      reference: SVGElement;
      clientPoint?: { x: number; y: number };
      placement: "left" | "right";
    }
  >();

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

  const getReferenceProps = (data: TooltipData) => {
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
        const svg = event.currentTarget.ownerSVGElement;
        const chartBounds = svg?.getBoundingClientRect();
        const focusPoint = svg?.createSVGPoint();
        if (focusPoint && data.focusPoint) {
          focusPoint.x = data.focusPoint.x;
          focusPoint.y = data.focusPoint.y;
        }
        const screenMatrix = svg?.getScreenCTM();
        const transformedFocusPoint =
          focusPoint && data.focusPoint && screenMatrix
            ? focusPoint.matrixTransform(screenMatrix)
            : undefined;
        const referenceX =
          transformedFocusPoint?.x ?? sliceBounds.left + sliceBounds.width / 2;
        setActiveTooltip({
          ...data,
          reference: event.currentTarget,
          clientPoint: transformedFocusPoint
            ? { x: transformedFocusPoint.x, y: transformedFocusPoint.y }
            : undefined,
          placement:
            chartBounds && referenceX < chartBounds.left + chartBounds.width / 2
              ? "left"
              : "right",
        });
      },
      onBlur: () => setActiveTooltip(undefined),
    };
  };

  const tooltipRows: Array<
    TooltipItem & {
      id: string;
      emphasis: "default" | "emphasized" | "dimmed";
      kind: "peer" | "primary" | "detail";
    }
  > = [];
  if (activeTooltip?.type === "items") {
    for (const item of activeTooltip.items) {
      let emphasis: "default" | "emphasized" | "dimmed" = "dimmed";
      if (activeTooltip.emphasizedItemId === undefined) emphasis = "default";
      else if (activeTooltip.emphasizedItemId === item.id) {
        emphasis = "emphasized";
      }
      tooltipRows.push({ ...item, emphasis, kind: "peer" });
    }
  } else if (activeTooltip?.type === "primary") {
    tooltipRows.push({
      id: "primary",
      label: activeTooltip.label,
      value: activeTooltip.value,
      color: activeTooltip.color,
      emphasis: "default",
      kind: "primary",
    });
    tooltipRows.push(
      ...(activeTooltip.details ?? []).map((item, index) => ({
        ...item,
        id: `detail-${index}`,
        emphasis: "default" as const,
        kind: "detail" as const,
      })),
    );
  }

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
            {activeTooltip.heading ? (
              <div className="text-foreground font-bold">
                {activeTooltip.heading}
              </div>
            ) : null}
            {tooltipRows.map((item, index) => (
              <Fragment key={item.id}>
                {item.kind === "detail" &&
                tooltipRows[index - 1]?.kind !== "detail" ? (
                  <div role="separator" className="border-border/50 border-t" />
                ) : null}
                <div
                  className={`flex min-w-0 items-center gap-2 leading-tight transition-opacity duration-150 ${item.emphasis === "dimmed" ? "opacity-30" : "opacity-100"}`}
                >
                  {item.kind !== "detail" && item.color ? (
                    <svg
                      viewBox="0 0 10 10"
                      className="size-2.5 shrink-0"
                      aria-hidden="true"
                    >
                      <rect width="10" height="10" rx="2" fill={item.color} />
                    </svg>
                  ) : null}
                  {item.kind === "detail" ? (
                    <span className="w-2.5 shrink-0" />
                  ) : null}
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-x-3">
                    <span
                      className={`${item.emphasis === "emphasized" ? "text-foreground" : "text-muted-foreground"} truncate`}
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <span
                      className={`text-foreground shrink-0 font-mono whitespace-nowrap tabular-nums ${item.kind === "detail" ? "" : "font-bold"}`}
                    >
                      {item.value}
                    </span>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
