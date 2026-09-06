import { screen } from "@testing-library/react";

import { renderMonitorWithIntl } from "../test-utils";
import { MonitorSeverityBadge } from "./MonitorSeverityBadge";
import { MonitorsOnboarding } from "./MonitorsOnboarding";
import { useMonitorLabels } from "../helpers/useMonitorLabels";

const MonitorLabelProbe = () => {
  const { chartSubtitle, namePlaceholder } = useMonitorLabels();
  return (
    <>
      <span>
        {namePlaceholder({
          view: "observations",
          measure: "latency",
          aggregation: "avg",
          thresholdOperator: "LT",
          alertThreshold: 100,
        })}
      </span>
      <span>
        {chartSubtitle({
          view: "observations",
          measure: "latency",
          aggregation: "avg",
          window: "5m",
        })}
      </span>
    </>
  );
};

describe("monitor localization", () => {
  it("renders onboarding actions and severity labels in Simplified Chinese", () => {
    renderMonitorWithIntl(
      <>
        <MonitorsOnboarding projectId="project-1" hasCUDAccess />
        <MonitorSeverityBadge severity="PAUSED" />
        <MonitorLabelProbe />
      </>,
      "zh-CN",
    );

    expect(screen.getByText("在问题影响用户之前及时发现")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "连接 Slack" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "创建告警" })).toBeInTheDocument();
    expect(screen.getByText("已暂停")).toBeInTheDocument();
    expect(screen.getByText("观测延迟的平均值低于100")).toBeInTheDocument();
    expect(
      screen.getByText("观测延迟的平均值，每5 分钟统计一次"),
    ).toBeInTheDocument();
  });
});
