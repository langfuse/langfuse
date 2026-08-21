import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { VisibilityState } from "@tanstack/react-table";
import { ExperimentGridCell } from "./ExperimentGridCell";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { IO_TABLE_CHAR_LIMIT } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

const mockScoreMetadata: { current: unknown } = { current: undefined };

vi.mock("@/src/utils/api", () => ({
  api: {
    scores: {
      getScoreMetadataById: {
        useQuery: () => ({ data: mockScoreMetadata.current }),
      },
    },
  },
}));

vi.mock("@/src/components/ui/IOTableCell", () => ({
  MemoizedIOTableCell: () => <div>IO cell</div>,
}));

const observationScoreKey = "quality-EVAL-NUMERIC";
const traceScoreKey = "correctness-API-NUMERIC";

const renderGridCell = (
  showScoreLevelLabels: boolean,
  columnVisibility: VisibilityState = { output: false, metadata: false },
  output: unknown = null,
) =>
  render(
    <TooltipProvider>
      <ExperimentGridCell
        projectId="project-id"
        itemId="item-id"
        output={output}
        level="GENERATION"
        startTime={new Date("2026-07-30T10:00:00.000Z")}
        observationId="observation-id"
        traceId="trace-id"
        singleLine={false}
        scores={{
          [observationScoreKey]: {
            type: "NUMERIC",
            values: [0.8],
            average: 0.8,
            comment: "Evaluator comment",
            executionTraceId: "execution-trace-id",
          },
        }}
        traceScores={{
          [traceScoreKey]: {
            type: "NUMERIC",
            values: [0.9],
            average: 0.9,
          },
        }}
        observationScoreOrder={[observationScoreKey]}
        traceScoreOrder={[traceScoreKey]}
        isBaseline
        columnVisibility={columnVisibility}
        showScoreLevelLabels={showScoreLevelLabels}
      />
    </TooltipProvider>,
  );

describe("ExperimentGridCell", () => {
  it("shows full labels for every score when both levels are present", () => {
    renderGridCell(true);

    expect(screen.getByText("Observation")).toBeInTheDocument();
    expect(screen.getByText("Trace")).toBeInTheDocument();
  });

  it("omits score level decoration when only one level is present", () => {
    renderGridCell(false);

    expect(screen.queryByText("Observation")).not.toBeInTheDocument();
    expect(screen.queryByText("Trace")).not.toBeInTheDocument();
    expect(screen.getByText("quality")).toBeInTheDocument();
    expect(screen.getByText("correctness")).toBeInTheDocument();
  });

  it("renders the latency row when no latency value is available", () => {
    renderGridCell(false, { output: false });

    expect(screen.getByText("Latency")).toBeInTheDocument();
  });

  it("renders output in a fixed-height scroll area", () => {
    renderGridCell(false, { metadata: false });

    const outputContent =
      screen.getByText("Output").parentElement?.nextElementSibling;

    expect(outputContent).toHaveClass("h-16", "overflow-hidden");
  });

  it("links evaluator score comments to their execution trace", async () => {
    renderGridCell(false);

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "View score comment" }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 750));
    });

    const executionTraceLink = await waitFor(() =>
      screen.getByRole("link", { name: "View execution trace" }),
    );

    expect(executionTraceLink).toHaveAttribute(
      "href",
      "/project/project-id/traces/execution-trace-id",
    );
  });
});

/**
 * Score `metadata` is arbitrary user-supplied JSON with no server-side size
 * limit. The metadata peek used to mount `JSONView` unconditionally, freezing
 * the tab on hover for a large payload -- the same failure mode already
 * fixed for trace IO table cells (`IOTableCell.tsx`, gated on
 * `IO_TABLE_CHAR_LIMIT`). These tests prove `ScoreMetadataPeek` is gated the
 * same way.
 */
describe("ExperimentGridCell score metadata peek size gate", () => {
  const renderGridCellWithMetadataScore = () =>
    render(
      <MarkdownContextProvider>
        <TooltipProvider>
          <ExperimentGridCell
            projectId="project-id"
            itemId="item-id"
            output={null}
            level="GENERATION"
            startTime={new Date("2026-07-30T10:00:00.000Z")}
            observationId="observation-id"
            traceId="trace-id"
            singleLine={false}
            scores={{
              [observationScoreKey]: {
                type: "NUMERIC",
                values: [0.8],
                average: 0.8,
                id: "score-id",
                hasMetadata: true,
              },
            }}
            traceScores={{}}
            observationScoreOrder={[observationScoreKey]}
            traceScoreOrder={[]}
            isBaseline
            columnVisibility={{ output: false, metadata: false }}
            showScoreLevelLabels={false}
          />
        </TooltipProvider>
      </MarkdownContextProvider>,
    );

  // Score peek content portals outside the RTL `container` (into a layer
  // under `document.body`), so assertions below check `document.body`, not
  // `container`.
  const openMetadataPeek = async (container: HTMLElement) => {
    const bracesIcon = container.querySelector("svg.lucide-braces");
    if (!bracesIcon) {
      throw new Error("Expected the metadata peek trigger icon to render");
    }
    fireEvent.pointerEnter(bracesIcon.parentElement!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
  };

  it("renders the full JSON tree for metadata under the char limit", async () => {
    mockScoreMetadata.current = { key: "value" };
    const { container } = renderGridCellWithMetadataScore();

    await openMetadataPeek(container);

    await waitFor(() => {
      expect(document.body.textContent).toContain("key");
      expect(document.body.textContent).toContain("value");
    });
    expect(document.body.textContent).not.toContain("too large");
  });

  it("falls back to a truncated preview for metadata over the char limit", async () => {
    mockScoreMetadata.current = {
      blob: "x".repeat(IO_TABLE_CHAR_LIMIT + 50),
    };
    const { container } = renderGridCellWithMetadataScore();

    await openMetadataPeek(container);

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "too large to preview in full and was truncated",
      );
    });
  });
});
