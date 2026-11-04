import type { ReactNode } from "react";

export const CARTESIAN_CHART_INSETS = {
  top: 10,
  right: 16,
  bottomWithLabels: 26,
  bottomWithoutLabels: 12,
  minLeft: 64,
  compactMinLeft: 32,
};

const Y_TICK_HEIGHT = 28;

function getCartesianPlotHeight(height: number, showXAxisLabels: boolean) {
  return Math.max(
    0,
    height -
      CARTESIAN_CHART_INSETS.top -
      (showXAxisLabels
        ? CARTESIAN_CHART_INSETS.bottomWithLabels
        : CARTESIAN_CHART_INSETS.bottomWithoutLabels),
  );
}

function getCartesianTickCount(plotHeight: number) {
  return Math.min(5, Math.max(1, Math.floor(plotHeight / Y_TICK_HEIGHT)));
}

/** getMinLeft picks the y-axis gutter floor; compact fits short tick labels. */
function getMinLeft(compactYAxis: boolean) {
  if (compactYAxis) return CARTESIAN_CHART_INSETS.compactMinLeft;
  return CARTESIAN_CHART_INSETS.minLeft;
}

function getCartesianLayout({
  width,
  height,
  showXAxisLabels,
  compactYAxis,
  yTickLabels,
}: {
  width: number;
  height: number;
  showXAxisLabels: boolean;
  compactYAxis: boolean;
  yTickLabels: string[];
}) {
  const left = Math.max(
    getMinLeft(compactYAxis),
    ...yTickLabels.map((label) => label.length * 7 + 16),
  );
  return {
    left,
    top: CARTESIAN_CHART_INSETS.top,
    width: Math.max(0, width - left - CARTESIAN_CHART_INSETS.right),
    height: getCartesianPlotHeight(height, showXAxisLabels),
  };
}

export type CartesianPlot = ReturnType<typeof getCartesianLayout>;

export function CartesianLayout({
  width,
  height,
  showXAxisLabels,
  compactYAxis = false,
  children,
}: {
  width: number;
  height: number;
  showXAxisLabels: boolean;
  compactYAxis?: boolean;
  children: (layout: {
    measuredPlot: CartesianPlot;
    maxYTicks: number;
    plotForTicks: (
      labels: string[],
      options?: { showXAxisLabels: boolean },
    ) => CartesianPlot;
  }) => ReactNode;
}) {
  const measuredPlot = getCartesianLayout({
    width,
    height,
    showXAxisLabels,
    compactYAxis,
    yTickLabels: [],
  });
  return children({
    measuredPlot,
    maxYTicks: getCartesianTickCount(measuredPlot.height),
    plotForTicks: (yTickLabels, options) =>
      getCartesianLayout({
        width,
        height,
        showXAxisLabels: options?.showXAxisLabels ?? showXAxisLabels,
        compactYAxis,
        yTickLabels,
      }),
  });
}
