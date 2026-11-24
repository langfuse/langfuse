import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps } from "react";
import { vi } from "vitest";
import UserDetailPage from "./UserDetailPage";
import { type default as Page } from "@/src/components/layouts/Page";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn().mockResolvedValue(true),
  setTab: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: mocks.query, replace: mocks.replace }),
}));
vi.mock("@/src/hooks/useReadyRouteParams", () => ({
  useReadyRouteParams: () => ({
    ready: true,
    params: { projectId: "project-1", userId: "user-1" },
  }),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    users: {
      byId: { useQuery: () => ({}) },
      byIdFromEvents: { useQuery: () => ({}) },
    },
  },
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  withDefault: vi.fn(),
  useQueryParam: () => [mocks.query.tab, mocks.setTab],
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/components/layouts/Page", () => ({
  default: ({ children }: ComponentProps<typeof Page>) => children,
}));
vi.mock("@/src/features/traces/TracesTable", () => ({ default: () => null }));
vi.mock("@/src/features/scores/ScoresTable", () => ({ default: () => null }));
vi.mock("@/src/features/sessions/SessionsTable", () => ({
  default: () => null,
}));
vi.mock("@/src/features/events/components/EventsTable", () => ({
  default: () => null,
}));
vi.mock("@/src/components/table/peek/TablePeekViewTraceDetail", () => ({
  TablePeekViewTraceDetail: () => null,
}));
vi.mock("@/src/features/navigate-detail-pages/DetailPageNav", () => ({
  DetailPageNav: () => null,
}));

it.each([
  ["Traces", "Sessions"],
  ["Traces", "Scores"],
  ["Sessions", "Traces"],
  ["Sessions", "Scores"],
  ["Scores", "Traces"],
  ["Scores", "Sessions"],
])("clears peek state when switching from %s to %s", async (from, to) => {
  mocks.replace.mockClear();
  mocks.setTab.mockClear();
  mocks.query = {
    projectId: "project-1",
    userId: "user-1",
    tab: from,
    peek: "item-1",
    peekView: "expanded",
    sessionPeek: "peek=trace-1",
    traceId: "trace-1",
    observation: "observation-1",
    timestamp: "2026-01-01",
    aggregation: "session",
    traceView: "messages",
    filter: "filter",
    orderBy: "order",
    retained: "value",
  };
  render(<UserDetailPage />);
  fireEvent.click(screen.getByRole("button", { name: to }));
  await waitFor(() => expect(mocks.setTab).toHaveBeenCalledWith(to));
  expect(mocks.replace).toHaveBeenCalledWith({
    query: {
      projectId: "project-1",
      userId: "user-1",
      tab: from,
      retained: "value",
    },
  });
});
