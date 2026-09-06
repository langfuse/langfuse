import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import chineseMessages from "@/src/features/i18n/messages/zh-CN/playgroundDashboard.json";
import systemUiMessages from "@/src/features/i18n/messages/zh-CN/systemUi.json";
import evaluationAnalyticsMessages from "@/src/features/i18n/messages/zh-CN/evaluationAnalytics.json";
import { DashboardTable } from "./DashboardTable";
import { EditDashboardDialog } from "./EditDashboardDialog";
import { HomeDashboardSelect } from "./HomeDashboardSelect";
import { DashboardWidget } from "@/src/features/widgets/components/DashboardWidget";

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ dashboard: { invalidate: vi.fn() } }),
    dashboard: {
      updateDashboardMetadata: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      allDashboards: {
        useQuery: () => ({
          data: {
            dashboards: [
              {
                id: "langfuse-home-dashboard",
                name: "Langfuse Home",
                description: "Home dashboard description",
                owner: "LANGFUSE",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "managed-cost-dashboard-from-installation",
                name: "Langfuse Cost Dashboard",
                description: "Cost dashboard description",
                owner: "LANGFUSE",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "managed-latency-dashboard-from-installation",
                name: "Langfuse Latency Dashboard",
                description: "Latency dashboard description",
                owner: "LANGFUSE",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "managed-usage-dashboard-from-installation",
                name: "Langfuse Usage Management",
                description: "Usage dashboard description",
                owner: "LANGFUSE",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "project-view",
                name: "Customer dashboard",
                description: "Customer dashboard description",
                owner: "PROJECT",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
              {
                id: "langfuse-view",
                name: "Langfuse dashboard",
                description: "Langfuse dashboard description",
                owner: "LANGFUSE",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              },
            ],
          },
          isPending: false,
          isError: false,
          isSuccess: true,
        }),
      },
    },
    dashboardWidgets: {
      get: {
        useQuery: () => ({
          data: {
            id: "managed-cost-widget-from-installation",
            name: "Total costs",
            description: "Total cost across all use cases",
            owner: "LANGFUSE",
            view: "observations",
            dimensions: [],
            metrics: [{ measure: "totalCost", agg: "sum" }],
            filters: [],
            chartType: "NUMBER",
            chartConfig: { type: "NUMBER" },
            minVersion: 1,
          },
          isPending: false,
        }),
      },
      copyToProject: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-id",
}));

vi.mock("@/src/features/orderBy/hooks/useOrderByState", () => ({
  useOrderByState: () => [null, vi.fn()],
}));

vi.mock("use-query-params", () => ({
  NumberParam: {},
  withDefault: () => ({}),
  useQueryParams: () => [{ pageIndex: 0, pageSize: 50 }, vi.fn()],
}));

vi.mock("@/src/features/navigate-detail-pages/context", () => ({
  useDetailPageLists: () => ({ setDetailPageList: vi.fn() }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn(), query: {} }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: false }),
}));

vi.mock("@/src/hooks/useDashboardQueryScheduler", () => ({
  useScheduledDashboardExecuteQuery: () => ({
    data: [{ sum_totalCost: 12 }],
    isPending: false,
    isError: false,
    error: null,
    progress: null,
  }),
}));

vi.mock("@/src/features/widgets/hooks/useWidgetQueryErrorCapture", () => ({
  useCaptureWidgetHighCardinalityError: vi.fn(),
}));

vi.mock("@/src/features/widgets/chart-library/Chart", () => ({
  Chart: ({ data }: { data: Array<{ dimension?: string }> }) => (
    <div data-testid="chart">
      {data.map((item, index) => (
        <span key={index}>{item.dimension}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/src/components/table/data-table", () => ({
  DataTable: ({
    data,
  }: {
    data: {
      data?: Array<{ id: string; name: string; description: string }>;
    };
  }) => (
    <div>
      {data.data?.map((dashboard) => (
        <div key={dashboard.id}>
          <span>{dashboard.name}</span>
          <span>{dashboard.description}</span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/src/components/ui/combobox", () => ({
  Combobox: ({
    options,
    searchPlaceholder,
    emptyText,
  }: {
    options: Array<{
      heading: string;
      options: Array<{ label: string; badge?: string }>;
    }>;
    searchPlaceholder: string;
    emptyText: string;
  }) => (
    <div>
      <input placeholder={searchPlaceholder} />
      <span>{emptyText}</span>
      {options.map((group) => (
        <section key={group.heading}>
          <h3>{group.heading}</h3>
          {group.options.map((option) => (
            <div key={option.label}>
              {option.label}
              {option.badge ? <span>{option.badge}</span> : null}
            </div>
          ))}
        </section>
      ))}
    </div>
  ),
}));

const renderChinese = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{
        playgroundDashboard: chineseMessages,
        systemUi: systemUiMessages,
        evaluationAnalytics: evaluationAnalyticsMessages,
      }}
    >
      {element}
    </NextIntlClientProvider>,
  );

describe("dashboard localization", () => {
  it("localizes the edit dashboard dialog", () => {
    renderChinese(
      <EditDashboardDialog
        open
        onOpenChange={vi.fn()}
        projectId="project-id"
        dashboardId="dashboard-id"
        initialName="Customer dashboard"
        initialDescription="Customer description"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "编辑仪表盘" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("名称")).toHaveValue("Customer dashboard");
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存更改" }),
    ).toBeInTheDocument();
  });

  it("localizes managed dashboard options and preserves project names", () => {
    renderChinese(
      <HomeDashboardSelect
        projectId="project-id"
        value="project-view"
        defaultDashboardId="project-view"
        onValueChange={vi.fn()}
        currentDashboardName="Customer dashboard"
        currentDashboardOwner="PROJECT"
      />,
    );

    expect(screen.getByText("此项目")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 维护")).toBeInTheDocument();
    expect(screen.getByText("Customer dashboard")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 首页")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 成本仪表盘")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 延迟仪表盘")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 用量管理")).toBeInTheDocument();
    expect(screen.getByText("默认")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索仪表盘...")).toBeInTheDocument();
  });

  it("localizes every Langfuse-managed dashboard in the dashboard table", () => {
    renderChinese(<DashboardTable />);

    expect(screen.getByText("Langfuse 首页")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 成本仪表盘")).toBeInTheDocument();
    expect(screen.getByText("查看你的 LLM 成本。")).toBeInTheDocument();
    expect(screen.getByText("Langfuse 延迟仪表盘")).toBeInTheDocument();
    expect(
      screen.getByText("监控链路和生成的延迟指标，以优化性能。"),
    ).toBeInTheDocument();
    expect(screen.getByText("Langfuse 用量管理")).toBeInTheDocument();
    expect(
      screen.getByText("跟踪链路、观测和评分的用量指标，以管理资源分配。"),
    ).toBeInTheDocument();
  });

  it("localizes Langfuse-managed widget metadata", () => {
    renderChinese(
      <DashboardWidget
        projectId="project-id"
        dashboardId="dashboard-id"
        placement={{
          id: "placement-id",
          widgetId: "managed-cost-widget-from-installation",
          x: 0,
          y: 0,
          x_size: 4,
          y_size: 4,
          type: "widget",
        }}
        dateRange={undefined}
        filterState={[]}
        onDeleteWidget={vi.fn()}
        dashboardOwner="LANGFUSE"
        readOnly
      />,
    );

    expect(screen.getByText("总成本")).toBeInTheDocument();
    expect(screen.getByText("所有用例的总成本")).toBeInTheDocument();
    expect(screen.getByText("总和成本")).toBeInTheDocument();
  });
});
