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
vi.mock("../contexts/TraceReviewPanelProvider", () => ({
  useTraceReviewPanel: () => store,
}));
vi.mock("../contexts/SelectionProvider", () => ({
  useSelection: () => ({ selectedNodeId: state.selectedNodeId }),
}));
vi.mock("../contexts/TraceDataProvider", () => ({
  useTraceData: () => ({
    trace: { id: "trace", projectId: "project", environment: "default" },
    observations: [
      { id: "first", environment: "default" },
      { id: "second", environment: "default" },
    ],
    serverScores: [
      { id: "trace-score", observationId: null },
      { id: "first-score", observationId: "first" },
      { id: "second-score", observationId: "second" },
    ],
  }),
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
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
  getCommentDrawerInitialStateFromUrl: () =>
    state.query.comments === "open" &&
    state.query.commentObjectId &&
    state.query.commentObjectType
      ? {
          type: "comments" as const,
          objectId: state.query.commentObjectId,
          objectType: state.query.commentObjectType,
        }
      : undefined,
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

it("shows the newly selected object's comments while the panel URL still points at the previous one", () => {
  state.query = {
    comments: "open",
    commentObjectId: "trace",
    commentObjectType: "TRACE",
  };
  state.selectedNodeId = "first";
  const view = render(<TraceReviewPanel projectId="project" />);
  state.selectedNodeId = "second";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("comments")).toHaveTextContent("second");
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
