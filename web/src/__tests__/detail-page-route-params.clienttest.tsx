import { render, screen } from "@testing-library/react";
import type { Mock } from "vitest";
import { useRouter } from "next/router";

vi.mock("next/router", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/src/features/traces/TracePage", () => ({
  TracePage: ({ traceId }: { traceId: string }) => (
    <div data-testid="trace-page">{traceId}</div>
  ),
}));

vi.mock("@/src/components/session", () => ({
  SessionPage: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-page">{sessionId}</div>
  ),
  SessionEventsPage: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="session-events-page">{sessionId}</div>
  ),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: false, isResolved: true }),
}));

vi.mock(
  "@/src/features/annotation-queues/components/AnnotationQueuesItem",
  () => ({
    AnnotationQueuesItem: ({
      annotationQueueId,
    }: {
      annotationQueueId: string;
    }) => <div data-testid="annotation-queue-item">{annotationQueueId}</div>,
  }),
);

vi.mock("@/src/features/annotation-queues/pages/AnnotationQueueItems", () => ({
  default: ({ queueId }: { queueId?: string }) => (
    <div data-testid="annotation-queue-items">{queueId ?? "mounted"}</div>
  ),
}));

vi.mock("@/src/features/datasets/components/DatasetItemDetailPage", () => ({
  DatasetItemDetailPage: () => <div data-testid="dataset-item-detail-page" />,
}));

vi.mock(
  "@/src/features/datasets/components/DatasetItemViewModeContent",
  () => ({
    DatasetItemViewModeContent: () => null,
  }),
);

vi.mock(
  "@/src/features/datasets/components/DatasetItemVersionedContent",
  () => ({
    DatasetItemVersionedContent: () => null,
  }),
);

vi.mock(
  "@/src/features/datasets/components/DatasetVersionHistoryPanel",
  () => ({
    DatasetVersionHistoryPanel: () => null,
  }),
);

vi.mock(
  "@/src/features/datasets/components/DatasetVersionWarningBanner",
  () => ({
    DatasetVersionWarningBanner: () => null,
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      itemByIdAtVersion: {
        useQuery: () => ({ data: null, isLoading: false }),
      },
      byId: { useQuery: () => ({ data: null }) },
      itemVersionHistory: { useQuery: () => ({ data: undefined }) },
    },
  },
}));

vi.mock("@/src/features/datasets/hooks/useDatasetVersion", () => ({
  useDatasetVersion: () => ({
    selectedVersion: null,
    resetToLatest: () => undefined,
  }),
}));

vi.mock("@/src/components/useSessionStorage", () => ({
  default: (_key: string, initial: unknown) => [initial, () => undefined],
}));

vi.mock(
  "@/src/features/datasets/components/DatasetRunItemsByItemTable",
  () => ({
    DatasetRunItemsByItemTable: () => (
      <div data-testid="dataset-item-runs-table" />
    ),
  }),
);

import TracePageRoute from "@/src/pages/project/[projectId]/traces/[traceId]";
import SessionPageRoute from "@/src/pages/project/[projectId]/sessions/[sessionId]";
import AnnotationQueueItemRoute from "@/src/pages/project/[projectId]/annotation-queues/[queueId]/items/[itemId]";
import AnnotationQueueItemsIndexRoute from "@/src/pages/project/[projectId]/annotation-queues/[queueId]/index";
import DatasetItemDetailRoute from "@/src/pages/project/[projectId]/datasets/[datasetId]/items/[itemId]/index";
import DatasetItemRunsRoute from "@/src/pages/project/[projectId]/datasets/[datasetId]/items/[itemId]/runs";

function mockRouterQuery(query: Record<string, string | undefined>) {
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

  test("dataset item detail does not mount while router.query is empty", () => {
    mockRouterQuery({});
    render(<DatasetItemDetailRoute />);
    expect(screen.queryByTestId("dataset-item-detail-page")).toBeNull();
  });

  test("dataset item detail mounts once dynamic params are strings", () => {
    mockRouterQuery({
      projectId: "p1",
      datasetId: "d1",
      itemId: "i1",
    });
    render(<DatasetItemDetailRoute />);
    expect(screen.getByTestId("dataset-item-detail-page")).toBeInTheDocument();
  });

  test("dataset item runs does not mount while router.query is empty", () => {
    mockRouterQuery({});
    render(<DatasetItemRunsRoute />);
    expect(screen.queryByTestId("dataset-item-detail-page")).toBeNull();
  });

  test("dataset item runs mounts once dynamic params are strings", () => {
    mockRouterQuery({
      projectId: "p1",
      datasetId: "d1",
      itemId: "i1",
    });
    render(<DatasetItemRunsRoute />);
    expect(screen.getByTestId("dataset-item-detail-page")).toBeInTheDocument();
  });
});
