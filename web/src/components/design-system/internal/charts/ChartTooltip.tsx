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
import { Check } from "lucide-react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { useLayerContainer } from "@/src/context/LayerContext/LayerContext";
import { CHART_TRANSITION_DURATION } from "@/src/components/design-system/charts/constants";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type TooltipItem = {
  label: string;
  value: string;
  color?: string;
};

type TooltipData = {
  index: number;
  heading?: string;
  hint?: string;
  copyLabel?: string;
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
  | {
      type: "empty";
      items?: never;
      emphasizedItemId?: never;
      label?: never;
      value?: never;
      color?: never;
      details?: never;
    }
);

export function ChartTooltip({
  children,
}: {
  children: (controller: {
    activeIndex: number | undefined;
    getReferenceProps: (data: TooltipData) => {
      onPointerEnter: (event: PointerEvent<SVGElement | HTMLElement>) => void;
      onPointerMove: (event: PointerEvent<SVGElement | HTMLElement>) => void;
      onPointerLeave: () => void;
      onFocus: (event: FocusEvent<SVGElement | HTMLElement>) => void;
      onBlur: () => void;
      onClick: (() => Promise<void>) | undefined;
      onKeyDown:
        | ((event: KeyboardEvent<SVGElement | HTMLElement>) => Promise<void>)
        | undefined;
    };
  }) => ReactNode;
}) {
  const [activeTooltip, setActiveTooltip] = useState<
    TooltipData & {
      reference: SVGElement | HTMLElement;
      clientPoint?: { x: number; y: number };
      placement: "left" | "right";
    }
  >();
  const [copyFeedback, setCopyFeedback] = useState<{
    index: number;
    status: "copied" | "error";
  }>();
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(feedbackTimeout.current), []);

  const copyLabel = async (index: number, label: string) => {
    try {
      await copyTextToClipboard(label);
      setCopyFeedback({ index, status: "copied" });
    } catch (error) {
      console.error("Unable to copy to clipboard", error);
      setCopyFeedback({ index, status: "error" });
    }
    clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(
      () => setCopyFeedback(undefined),
      1500,
    );
  };

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
    const labelToCopy = data.copyLabel;
    const showAtPointer = (event: PointerEvent<SVGElement | HTMLElement>) => {
      const { clientX, clientY, currentTarget } = event;
      const chartBounds =
        currentTarget instanceof SVGElement
          ? currentTarget.ownerSVGElement?.getBoundingClientRect()
          : currentTarget.parentElement?.getBoundingClientRect();
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
      onFocus: (event: FocusEvent<SVGElement | HTMLElement>) => {
        const sliceBounds = event.currentTarget.getBoundingClientRect();
        const svg =
          event.currentTarget instanceof SVGElement
            ? event.currentTarget.ownerSVGElement
            : undefined;
        const chartBounds =
          svg?.getBoundingClientRect() ??
          event.currentTarget.parentElement?.getBoundingClientRect();
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
      onClick:
        labelToCopy === undefined
          ? undefined
          : async () => copyLabel(data.index, labelToCopy),
      onKeyDown:
        labelToCopy === undefined
          ? undefined
          : async (event: KeyboardEvent<SVGElement | HTMLElement>) => {
              if (event.currentTarget instanceof HTMLElement) return;
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              await copyLabel(data.index, labelToCopy);
            },
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

  const activeCopyStatus =
    copyFeedback?.index === activeTooltip?.index
      ? copyFeedback?.status
      : undefined;

  return (
    <>
      {children({
        activeIndex: activeTooltip?.index,
        getReferenceProps,
      })}
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
                  className={`flex min-w-0 items-center gap-2 leading-tight transition-opacity ${item.emphasis === "dimmed" ? "opacity-30" : "opacity-100"}`}
                  style={{ transitionDuration: CHART_TRANSITION_DURATION }}
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
                      className={`${item.kind === "primary" || item.emphasis === "emphasized" ? "text-foreground" : "text-muted-foreground"} truncate`}
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
            {activeTooltip.type === "empty" ? (
              <div className="text-muted-foreground">No data available</div>
            ) : null}
            {activeTooltip.hint ? (
              <div
                className="border-border/50 text-muted-foreground/70 grid border-t pt-1.5 text-[10px]"
                role="status"
              >
                <span
                  className={`[grid-area:1/1] ${activeCopyStatus ? "invisible" : "visible"}`}
                >
                  {activeTooltip.hint}
                </span>
                <span
                  className={`flex items-center gap-1 [grid-area:1/1] ${activeCopyStatus === "copied" ? "visible" : "invisible"}`}
                >
                  Label copied to clipboard{" "}
                  <Check className="size-3" aria-hidden="true" />
                </span>
                <span
                  className={`[grid-area:1/1] ${activeCopyStatus === "error" ? "visible" : "invisible"}`}
                >
                  Could not copy label
                </span>
              </div>
            ) : null}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
