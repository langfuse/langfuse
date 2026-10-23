import { fireEvent, render, screen } from "@testing-library/react";
import { createTraceReviewPanelStore } from "../state/traceReviewPanelStore";
import { TraceReviewPanel } from "./TraceReviewPanel";

const state = vi.hoisted(() => ({
  query: { annotation: "open" } as Record<string, string>,
  selectedNodeId: "first",
  replace: vi.fn(),
}));
const store = createTraceReviewPanelStore({
  projectId: "project",
});
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: state.query,
    pathname: "/trace",
    replace: state.replace,
  }),
}));
vi.mock("../contexts/TraceReviewPanelContext", () => ({
  useTraceReviewPanel: () => store,
}));
vi.mock("../contexts/SelectionContext", () => ({
  useSelection: () => ({ selectedNodeId: state.selectedNodeId }),
}));
vi.mock("../contexts/TraceDataContext", () => ({
  useTraceData: () => ({
    trace: { id: "trace", projectId: "project", environment: "default" },
    sessionTraces: [
      { id: "trace", projectId: "project", environment: "default" },
      { id: "other-trace", projectId: "project", environment: "default" },
    ],
    observations: [
      { id: "first", traceId: "trace", environment: "default" },
      { id: "second", traceId: "trace", environment: "default" },
      { id: "first", traceId: "other-trace", environment: "default" },
    ],
    serverScores: [
      { id: "trace-score", traceId: "trace", observationId: null },
      { id: "first-score", traceId: "trace", observationId: "first" },
      { id: "second-score", traceId: "trace", observationId: "second" },
      { id: "other-trace-score", traceId: "other-trace", observationId: null },
      {
        id: "other-first-score",
        traceId: "other-trace",
        observationId: "first",
      },
    ],
  }),
}));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/scores/components/AnnotationPanelContent", () => ({
  AnnotationPanelContent: ({
    data,
  }: {
    data: {
      scoreTarget: { observationId?: string };
      scores: { id: string }[];
      companionTrace?: { scores: { id: string }[] };
    };
  }) => (
    <div data-testid="annotation">
      {data.scoreTarget.observationId ?? "trace"}:
      {data.scores.map((score) => score.id).join(",")}
      <span data-testid="trace-scope">
        {data.companionTrace?.scores.map((score) => score.id).join(",")}
      </span>
    </div>
  ),
}));
vi.mock("@/src/features/comments/CommentList", () => ({
  CommentList: ({ objectId }: { objectId: string }) => (
    <div data-testid="comments">{objectId}</div>
  ),
}));
vi.mock("@/src/features/comments/CommentDrawerController", () => ({
  getCommentDrawerInitialStateFromUrl: () => undefined,
}));

it("follows the selected annotation target and switches panels through the URL", () => {
  const view = render(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "first:first-score",
  );
  expect(screen.getByTestId("trace-scope")).toHaveTextContent("trace-score");
  state.selectedNodeId = "second";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "second:second-score",
  );
  expect(screen.getByTestId("trace-scope")).toHaveTextContent("trace-score");
  expect(screen.getByTestId("annotation")).not.toHaveTextContent("first-score");
  state.selectedNodeId = "trace";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:trace-score",
  );
  state.query = { comments: "open" };
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("comments")).toHaveTextContent("trace");
  expect(screen.queryByTestId("annotation")).not.toBeInTheDocument();
  state.query = { annotation: "open" };
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:trace-score",
  );
});

it("scopes annotations to the selected session trace, including reused observation IDs", () => {
  state.query = { annotation: "open" };
  state.selectedNodeId = "trace-trace";
  const view = render(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:trace-score",
  );
  expect(screen.getByTestId("annotation")).not.toHaveTextContent(
    "other-trace-score",
  );

  state.selectedNodeId = "trace-other-trace";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:other-trace-score",
  );

  state.selectedNodeId = "other-trace:first";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "first:other-first-score",
  );
  expect(screen.getByTestId("annotation")).not.toHaveTextContent(
    "first:first-score",
  );
  expect(screen.getByTestId("trace-scope")).toHaveTextContent(
    "other-trace-score",
  );
});

it("closes comment deep links with Escape and clears their URL target", () => {
  state.query = {
    comments: "open",
    commentObjectId: "trace",
    commentObjectType: "TRACE",
  };
  render(<TraceReviewPanel projectId="project" />);
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(state.replace).toHaveBeenCalledWith(
    { pathname: "/trace", query: {} },
    undefined,
    { shallow: true },
  );
});
