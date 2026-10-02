import { fireEvent, render, screen } from "@testing-library/react";
import { createTraceReviewPanelStore } from "../state/traceReviewPanelStore";
import { TraceReviewPanel } from "./TraceReviewPanel";

const state = vi.hoisted(() => ({
  query: { mode: "annotate" } as Record<string, string>,
  selectedNodeId: "first",
  replace: vi.fn(),
}));
const store = createTraceReviewPanelStore({ projectId: "project" });
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
vi.mock("@/src/features/events", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/scores/components/AnnotationPanelContent", () => ({
  AnnotationPanelContent: ({
    data,
  }: {
    data: { scoreTarget: { observationId?: string }; scores: { id: string }[] };
  }) => (
    <div data-testid="annotation">
      {data.scoreTarget.observationId ?? "trace"}:
      {data.scores.map((score) => score.id).join(",")}
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

it("follows selection and URL mode without replacing the review store", () => {
  const view = render(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "first:first-score",
  );
  state.selectedNodeId = "second";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "second:second-score",
  );
  state.selectedNodeId = "trace";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:trace-score",
  );
  state.query = { mode: "comment" };
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("comments")).toHaveTextContent("trace");
  expect(screen.queryByTestId("annotation")).not.toBeInTheDocument();
  state.query = { mode: "annotate" };
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("annotation")).toHaveTextContent(
    "trace:trace-score",
  );
});

it("closes legacy comment deep links with Escape and clears their URL target", () => {
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
