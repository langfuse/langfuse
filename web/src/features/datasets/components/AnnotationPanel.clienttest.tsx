import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { vi } from "vitest";
import { AnnotationPanel } from "./AnnotationPanel";
import {
  ActiveCellProvider,
  useActiveCell,
} from "../contexts/ActiveCellContext";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/src/components/useSessionStorage", () => ({
  default: function useSessionStorage(_key: string, initialValue: number) {
    return useState(initialValue);
  },
}));
vi.mock("@/src/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => children,
  ResizablePanel: ({ children }: { children: ReactNode }) => children,
  ResizableHandle: () => <hr />,
}));
vi.mock("@/src/features/scores", () => ({
  AnnotationForm: ({ actionButtons }: { actionButtons: ReactNode }) =>
    actionButtons,
  decomposeAggregateScoreKey: () => ({ source: "ANNOTATION" }),
}));
vi.mock(
  "@/src/features/annotation-queues/components/shared/CommentsSection",
  () => ({
    CommentsSection: ({
      onDraftChange,
    }: {
      onDraftChange: (hasDraft: boolean) => void;
    }) => {
      const [draft, setDraft] = useState("");
      return (
        <textarea
          aria-label="Comment draft"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            onDraftChange(Boolean(event.target.value));
          }}
        />
      );
    },
  }),
);

function ReviewHarness() {
  const { activeCell, setActiveCell, clearActiveCell, closeRunAnnotation } =
    useActiveCell();
  const [runs, setRuns] = useState(["first", "second"]);
  return (
    <>
      {["first", "second"].map((traceId) => (
        <button
          key={traceId}
          onClick={() =>
            setActiveCell({
              traceId,
              datasetRunId: traceId,
              scoreAggregates: {},
            })
          }
        >
          Review {traceId}
        </button>
      ))}
      {["first", "second"].map((runId) => (
        <button
          key={runId}
          onClick={() => {
            if (closeRunAnnotation?.(runId))
              setRuns((current) => current.filter((id) => id !== runId));
          }}
        >
          Remove {runId}
        </button>
      ))}
      <output aria-label="Compared runs">{runs.join(",")}</output>
      <button onClick={clearActiveCell}>Close side panel</button>
      <span data-testid="active-cell">{activeCell?.traceId ?? "closed"}</span>
      {activeCell && <AnnotationPanel projectId="project" />}
    </>
  );
}

it("guards every cell switch and close while preserving the current draft on rerenders", () => {
  const { rerender } = render(
    <ActiveCellProvider>
      <ReviewHarness />
    </ActiveCellProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review first" }));
  fireEvent.change(screen.getByLabelText("Comment draft"), {
    target: { value: "Unfinished review" },
  });

  fireEvent.click(screen.getByRole("button", { name: "Review second" }));
  expect(screen.getByTestId("active-cell")).toHaveTextContent("first");
  fireEvent.click(screen.getByRole("button", { name: "Close side panel" }));
  expect(screen.getByTestId("active-cell")).toHaveTextContent("first");
  fireEvent.click(
    screen.getByRole("button", { name: "Close annotation panel" }),
  );
  expect(screen.getByTestId("active-cell")).toHaveTextContent("first");
  fireEvent.click(screen.getByRole("button", { name: "Review first" }));
  rerender(
    <ActiveCellProvider>
      <ReviewHarness />
    </ActiveCellProvider>,
  );
  expect(screen.getByLabelText("Comment draft")).toHaveValue(
    "Unfinished review",
  );

  fireEvent.change(screen.getByLabelText("Comment draft"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review second" }));
  expect(screen.getByTestId("active-cell")).toHaveTextContent("second");
  fireEvent.click(screen.getByRole("button", { name: "Close side panel" }));
  expect(screen.getByTestId("active-cell")).toHaveTextContent("closed");
});

it("guards removal of the reviewed run and leaves unrelated run changes alone", () => {
  render(
    <ActiveCellProvider>
      <ReviewHarness />
    </ActiveCellProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review first" }));
  fireEvent.change(screen.getByLabelText("Comment draft"), {
    target: { value: "Keep this comment" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove second" }));
  expect(screen.getByLabelText("Compared runs")).toHaveTextContent(/^first$/);
  expect(screen.getByLabelText("Comment draft")).toHaveValue(
    "Keep this comment",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove first" }));
  expect(screen.getByLabelText("Compared runs")).toHaveTextContent(/^first$/);
  expect(screen.getByTestId("active-cell")).toHaveTextContent("first");
  fireEvent.change(screen.getByLabelText("Comment draft"), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove first" }));
  expect(screen.getByLabelText("Compared runs")).toBeEmptyDOMElement();
  expect(screen.getByTestId("active-cell")).toHaveTextContent("closed");
});
