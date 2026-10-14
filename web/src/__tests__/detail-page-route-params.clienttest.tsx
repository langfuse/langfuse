import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import { useRouter } from "next/router";

vi.mock("next/router", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/src/tracing/traces/TracePage", () => ({
  TracePage: ({ traceId }: { traceId: string }) => (
    <div data-testid="trace-page">{traceId}</div>
  ),
}));

vi.mock("@/src/sessions/SessionPages", () => ({
  SessionPage: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-page">{sessionId}</div>
  ),
  SessionEventsPage: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-events-page">{sessionId}</div>
  ),
}));

vi.mock("@/src/tracing/observations/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: false, isResolved: true }),
}));

vi.mock("@/src/analytics/visualization", () => ({
  WidgetForm: ({ projectId }: { projectId: string }) => (
    <div data-testid="widget-form">{projectId}</div>
  ),
}));

vi.mock("@/src/analytics/visualization/utils", () => ({
  getDefaultView: () => "traces",
}));

vi.mock("@/src/analytics/dashboards/components/SelectDashboardDialog", () => ({
  SelectDashboardDialog: () => null,
}));

vi.mock("@/src/app/utils/api", () => ({
  api: {
    dashboardWidgets: {
      create: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    dashboard: {
      allDashboards: {
        useQuery: () => ({ data: undefined, refetch: vi.fn() }),
      },
    },
  },
}));

vi.mock("@/src/analytics/internal/posthog/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/app/shell/layouts/page", () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="page">{children}</div>
  ),
}));

vi.mock("@/src/annotation/queues/components/AnnotationQueuesItem", () => ({
  AnnotationQueuesItem: ({
    annotationQueueId,
  }: {
    annotationQueueId: string;
  }) => <div data-testid="annotation-queue-item">{annotationQueueId}</div>,
}));

vi.mock("@/src/annotation/queues/pages/AnnotationQueueItems", () => ({
  default: ({ queueId }: { queueId?: string }) => (
    <div data-testid="annotation-queue-items">{queueId ?? "mounted"}</div>
  ),
}));

vi.mock("@/src/datasets/components/DatasetRunsTable", () => ({
  DatasetRunsTable: ({
    projectId,
    datasetId,
  }: {
    projectId: string;
    datasetId: string;
  }) => (
    <div data-testid="dataset-runs-table">
      {projectId}:{datasetId}
    </div>
  ),
}));

vi.mock("@/src/experiments/components/table", () => ({
  ExperimentsTable: ({ projectId }: { projectId: string }) => (
    <div data-testid="experiments-table">{projectId}</div>
  ),
}));

import TracePageRoute from "@/pages/project/[projectId]/traces/[traceId]";
import SessionPageRoute from "@/src/sessions/SessionDetailPage";
import AnnotationQueueItemRoute from "@/pages/project/[projectId]/annotation-queues/[queueId]/items/[itemId]";
import AnnotationQueueItemsIndexRoute from "@/pages/project/[projectId]/annotation-queues/[queueId]/index";
import DatasetExperimentsRoute from "@/pages/project/[projectId]/datasets/[datasetId]/experiments/index";
import NewWidgetRoute from "@/pages/project/[projectId]/widgets/new";

function mockRouterQuery(query: Record<string, string | string[] | undefined>) {
  (useRouter as Mock).mockReturnValue({
    query,
    isReady: Object.keys(query).length > 0,
  });
}

describe("detail page deep-link route params", () => {
  test("trace detail does not mount the page while router.query is empty", () => {
    mockRouterQuery({});
    render(<TracePageRoute />);
    expect(screen.queryByTestId("trace-page")).toBeNull();
  });

  test("trace detail mounts once dynamic params are strings", () => {
    mockRouterQuery({ projectId: "p1", traceId: "t1" });
    render(<TracePageRoute />);
    expect(screen.getByTestId("trace-page")).toHaveTextContent("t1");
  });

  test("session detail does not mount the page while router.query is empty", () => {
    mockRouterQuery({});
    render(<SessionPageRoute />);
    expect(screen.queryByTestId("session-page")).toBeNull();
  });

  test("session detail mounts once dynamic params are strings", () => {
    mockRouterQuery({ projectId: "p1", sessionId: "s1" });
    render(<SessionPageRoute />);
    expect(screen.getByTestId("session-page")).toHaveTextContent("s1");
  });

  test("session detail waits inline, without the full-screen branded overlay", () => {
    mockRouterQuery({});
    const { container } = render(<SessionPageRoute />);
    /** A spinner renders, so the negative assertions below cannot pass vacuously. */
    expect(container.querySelector("svg")).not.toBeNull();
    /** The branded auth screen is the only pending state with a heading, and the
     * only one that paints over the navigation shell. */
    expect(screen.queryByRole("heading")).toBeNull();
    expect(container.querySelector(".fixed.inset-0")).toBeNull();
  });

  test("annotation queue item does not mount while router.query is empty", () => {
    mockRouterQuery({});
    render(<AnnotationQueueItemRoute />);
    expect(screen.queryByTestId("annotation-queue-item")).toBeNull();
  });

  test("annotation queue item mounts once dynamic params are strings", () => {
    mockRouterQuery({ projectId: "p1", queueId: "q1", itemId: "i1" });
    render(<AnnotationQueueItemRoute />);
    expect(screen.getByTestId("annotation-queue-item")).toHaveTextContent("q1");
  });

  test("annotation queue items page does not mount while router.query is empty", () => {
    mockRouterQuery({});
    render(<AnnotationQueueItemsIndexRoute />);
    expect(screen.queryByTestId("annotation-queue-items")).toBeNull();
  });

  test("annotation queue items page mounts once dynamic params are strings", () => {
    mockRouterQuery({ projectId: "p1", queueId: "q1" });
    render(<AnnotationQueueItemsIndexRoute />);
    expect(screen.getByTestId("annotation-queue-items")).toHaveTextContent(
      "q1",
    );
  });

  test("dataset experiments does not mount the runs table while router.query is empty", () => {
    mockRouterQuery({});
    render(<DatasetExperimentsRoute />);
    expect(screen.queryByTestId("dataset-runs-table")).toBeNull();
    expect(screen.queryByTestId("experiments-table")).toBeNull();
  });

  test("new widget does not mount the form while router.query is empty", () => {
    mockRouterQuery({});
    render(<NewWidgetRoute />);
    expect(screen.queryByTestId("widget-form")).toBeNull();
  });

  test("new widget mounts the form once projectId is a string", () => {
    mockRouterQuery({ projectId: "p1" });
    render(<NewWidgetRoute />);
    expect(screen.getByTestId("widget-form")).toHaveTextContent("p1");
  });

  test("new widget does not mount the form when projectId is a duplicate query array", () => {
    mockRouterQuery({ projectId: ["p1", "p1"] });
    render(<NewWidgetRoute />);
    expect(screen.queryByTestId("widget-form")).toBeNull();
  });
});
