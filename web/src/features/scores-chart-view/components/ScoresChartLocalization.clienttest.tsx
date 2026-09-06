import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import evaluationAnalytics from "@/src/features/i18n/messages/zh-CN/evaluationAnalytics.json";
import systemUi from "@/src/features/i18n/messages/zh-CN/systemUi.json";
import { ScoreChartViewPanel } from "./ScoreChartViewPanel/ScoreChartViewPanel";
import { ScoreOutlierStripHeader } from "./ScoreOutlierStripHeader";

vi.mock("@/src/features/chart-view/components/ChartCanvas", () => ({
  ChartCanvas: ({ metricLabel }: { metricLabel: string }) => (
    <div data-testid="chart-metric">{metricLabel}</div>
  ),
}));

const renderChinese = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ evaluationAnalytics, systemUi }}
    >
      {element}
    </NextIntlClientProvider>,
  );

describe("scores chart localization", () => {
  it("localizes the chart description, metric, and chart type options", () => {
    renderChinese(
      <ScoreChartViewPanel
        config={{
          dataset: "numeric",
          metric: "count",
          aggregation: "count",
          breakdown: "name",
          chartType: "LINE_TIME_SERIES",
          timeGranularity: "hour",
        }}
        onConfigChange={vi.fn()}
        data={[]}
      />,
    );

    expect(screen.getByText("按名称拆分的评分数量趋势")).toBeInTheDocument();
    expect(screen.getByTestId("chart-metric")).toHaveTextContent("数量");
    expect(screen.getByRole("radio", { name: "折线图" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "面积图" })).toBeInTheDocument();
  });

  it("localizes score pulse mode and aggregation controls", () => {
    renderChinese(
      <ScoreOutlierStripHeader
        mode="value"
        onModeChange={vi.fn()}
        aggregation="avg"
        aggOptions={["avg", "min", "max"]}
        onAggregationChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "图表模式：数值" }),
    ).toHaveTextContent("数值");
    expect(
      screen.getByRole("button", { name: "数值聚合方式：平均值" }),
    ).toHaveTextContent("平均值");
  });
});
