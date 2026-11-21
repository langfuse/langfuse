import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTraceReviewPanelStore } from "../state/traceReviewPanelStore";
import { type AnnotationPanelData } from "@/src/features/scores/types";
import { useTraceReviewPanel } from "../contexts/TraceReviewPanelProvider";
import { TraceReviewPanel } from "./TraceReviewPanel";

const state = vi.hoisted(() => ({
  query: { annotation: "open" } as Record<string, string>,
  selectedNodeId: "first",
  replace: vi.fn(),
}));
let store: ReturnType<typeof createTraceReviewPanelStore>;
beforeEach(() => {
  store = createTraceReviewPanelStore({ projectId: "project" });
  state.query = { annotation: "open" };
  state.selectedNodeId = "first";
  state.replace.mockClear();
});
vi.mock("../contexts/TraceReviewPanelProvider", () => ({
  useTraceReviewPanel: () => store,
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    query: state.query,
    pathname: "/trace",
    replace: state.replace,
  }),
}));
vi.mock("../contexts/SelectionProvider", () => ({
  useSelection: () => ({ selectedNodeId: state.selectedNodeId }),
}));
vi.mock("../contexts/TraceDataProvider", () => ({
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
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/comments/CommentList", () => ({
  CommentList: ({ objectId }: { objectId: string }) => (
    <div data-testid="comments">{objectId}</div>
  ),
}));
vi.mock("@/src/features/comments/CommentDrawerController", () => ({
  getCommentDrawerInitialStateFromUrl: () => undefined,
}));
vi.mock("@/src/features/scores/components/AnnotationPanelContent", () => ({
  AnnotationPanelContent: ({ data }: { data: AnnotationPanelData }) => (
    <>
      <div data-testid="annotation-target">
        {JSON.stringify(data.scoreTarget)}
      </div>
      <div data-testid="annotation">
        {data.scoreTarget.type === "trace"
          ? (data.scoreTarget.observationId ?? "trace")
          : "session"}
        :{data.scores?.map((score) => score.id).join(",")}
        <span data-testid="trace-scope">
          {data.companionTrace?.scores.map((score) => score.id).join(",")}
        </span>
      </div>
    </>
  ),
}));

function HeaderAction({ session }: { session: boolean }) {
  const store = useTraceReviewPanel();
  return (
    <button
      onClick={() =>
        store.getState().actions.openAnnotation({
          scoreTarget: session
            ? { type: "session", sessionId: "session" }
            : { type: "trace", traceId: "trace" },
          scores: [],
          scoreMetadata: { projectId: "project" },
          analyticsData: {
            type: session ? "session" : "trace",
            source: "TraceDetail",
            isV4: true,
          },
        })
      }
    >
      Annotate header entity
    </button>
  );
}

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

  state.query = { comments: "open" };
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("comments")).toHaveTextContent(/^first$/);
  state.selectedNodeId = "trace-other-trace";
  view.rerender(<TraceReviewPanel projectId="project" />);
  expect(screen.getByTestId("comments")).toHaveTextContent(/^other-trace$/);
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

describe("TraceReviewPanel header targets", () => {
  it.each([false, true])(
    "honors explicit header targets, then resumes tree selection (session=%s)",
    (session) => {
      state.selectedNodeId = "first";
      const content = (
        <>
          <HeaderAction session={session} />
          <TraceReviewPanel projectId="project" />
        </>
      );
      const { rerender } = render(content);
      fireEvent.click(
        screen.getByRole("button", { name: "Annotate header entity" }),
      );
      expect(
        JSON.parse(
          screen.getByTestId("annotation-target").textContent ?? "null",
        ),
      ).toEqual(
        session
          ? { type: "session", sessionId: "session" }
          : { type: "trace", traceId: "trace" },
      );
      state.selectedNodeId = "trace";
      rerender(
        <>
          <HeaderAction session={session} />
          <TraceReviewPanel projectId="project" />
        </>,
      );
      expect(
        JSON.parse(
          screen.getByTestId("annotation-target").textContent ?? "null",
        ),
      ).toEqual({ type: "trace", traceId: "trace" });
      state.selectedNodeId = "first";
      rerender(
        <>
          <HeaderAction session={session} />
          <TraceReviewPanel projectId="project" />
        </>,
      );
      expect(
        JSON.parse(
          screen.getByTestId("annotation-target").textContent ?? "null",
        ),
      ).toEqual({ type: "trace", traceId: "trace", observationId: "first" });
    },
  );
});
