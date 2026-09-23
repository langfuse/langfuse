import type { ReactNode } from "react";

const TOP = 10;
const RIGHT = 16;
const BOTTOM_WITH_LABELS = 26;
const BOTTOM_WITHOUT_LABELS = 12;
const Y_TICK_HEIGHT = 28;

function getCartesianPlotHeight(height: number, showXAxisLabels: boolean) {
  return Math.max(
    0,
    height -
      TOP -
      (showXAxisLabels ? BOTTOM_WITH_LABELS : BOTTOM_WITHOUT_LABELS),
  );
}

function getCartesianTickCount(plotHeight: number) {
  return Math.min(5, Math.max(3, Math.floor(plotHeight / Y_TICK_HEIGHT)));
}

function getCartesianLayout({
  width,
  height,
  showXAxisLabels,
  yTickLabels,
}: {
  width: number;
  height: number;
  showXAxisLabels: boolean;
  yTickLabels: string[];
}) {
  const left = Math.max(
    64,
    ...yTickLabels.map((label) => label.length * 7 + 16),
  );
  return {
    left,
    top: TOP,
    width: Math.max(0, width - left - RIGHT),
    height: getCartesianPlotHeight(height, showXAxisLabels),
  };
}

export type CartesianPlot = ReturnType<typeof getCartesianLayout>;

export function CartesianLayout({
  width,
  height,
  showXAxisLabels,
  children,
}: {
  width: number;
  height: number;
  showXAxisLabels: boolean;
  children: (layout: {
    measuredPlot: CartesianPlot;
    maxYTicks: number;
    plotForTicks: (labels: string[]) => CartesianPlot;
  }) => ReactNode;
}) {
  const measuredPlot = getCartesianLayout({
    width,
    height,
    showXAxisLabels,
    yTickLabels: [],
  });
  return children({
    measuredPlot,
    maxYTicks: getCartesianTickCount(measuredPlot.height),
    plotForTicks: (yTickLabels) =>
      getCartesianLayout({ width, height, showXAxisLabels, yTickLabels }),
  });
}
