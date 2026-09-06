import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { ViewModeToggle } from "@/src/features/chart-view/components/ViewModeToggle";
import { ChartLoadingState } from "@/src/features/widgets/chart-library/ChartLoadingState";
import { ScoreAnalyticsNoticeBanner } from "./ScoreAnalyticsNoticeBanner";
import evaluationAnalytics from "@/src/features/i18n/messages/zh-CN/evaluationAnalytics.json";

vi.mock("./ScoreAnalyticsProvider", () => ({
  useScoreAnalytics: () => ({
    isEstimating: false,
    estimate: { estimatedMatchedCount: 200_000 },
    isLoading: false,
    data: {
      metadata: { mode: "single" },
      samplingMetadata: {
        isSampled: true,
        samplingRate: 0.25,
        preflightEstimates: { score1Count: 200_000 },
      },
    },
  }),
}));

vi.mock("./SamplingDetailsHoverCard", () => ({
  SamplingDetailsHoverCard: () => null,
}));

const messages = {
  evaluationAnalytics,
};

const renderChinese = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="zh-CN" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );

describe("evaluation and analytics localization", () => {
  it("localizes chart controls and query states", () => {
    renderChinese(
      <>
        <ViewModeToggle mode="table" onModeChange={vi.fn()} />
        <ChartLoadingState
          isLoading
          showSpinner={false}
          showHintImmediately
          hintText="查询提示"
          onRetry={vi.fn()}
        />
      </>,
    );

    expect(screen.getByRole("radio", { name: "表格视图" })).toHaveTextContent(
      "表格",
    );
    expect(screen.getByRole("radio", { name: "图表视图" })).toHaveTextContent(
      "图表",
    );
    expect(screen.getByText("查询需要处理")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("localizes sampled score analytics status", () => {
    renderChinese(<ScoreAnalyticsNoticeBanner />);

    expect(screen.getByText("抽样数据")).toBeInTheDocument();
    expect(
      screen.getByText("结果基于约 200,000 个评分的 25.00% 样本。"),
    ).toBeInTheDocument();
  });
});
