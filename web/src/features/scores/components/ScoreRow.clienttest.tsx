import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ScoreRow } from "./ScoreRow";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { IO_TABLE_CHAR_LIMIT } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";
import { type AggregatedScoreData } from "@langfuse/shared";

const mockMetadata: { current: unknown } = { current: undefined };

vi.mock("@/src/utils/api", () => ({
  api: {
    scores: {
      getScoreMetadataById: {
        useQuery: () => ({ data: mockMetadata.current }),
      },
    },
  },
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

const aggregate: AggregatedScoreData = {
  id: "score-id",
  type: "NUMERIC",
  values: [0.8],
  average: 0.8,
  hasMetadata: true,
};

const renderScoreRow = () =>
  render(
    <MarkdownContextProvider>
      <TooltipProvider>
        <ScoreRow
          projectId="project-id"
          name="quality"
          source="EVAL"
          aggregate={aggregate}
        />
      </TooltipProvider>
    </MarkdownContextProvider>,
  );

/** Opens the score HoverCard, then the metadata Tooltip nested inside it,
 *  mirroring how a user hovers score -> metadata. Both Radix primitives open
 *  after a real 700ms delay; their content portals outside the RTL
 *  `container` (into a layer under `document.body`), so callers must assert
 *  via `screen`/`document.body`, not `container`. */
async function openMetadataTooltip(previewMatcher: RegExp | string) {
  fireEvent.pointerEnter(screen.getByText("0.8000"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  const trigger = await waitFor(() => screen.getByText(previewMatcher));
  // Radix Tooltip.Trigger opens on pointermove, not pointerenter/pointerover.
  fireEvent.pointerMove(trigger);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });
}

/**
 * Score `metadata` is arbitrary user-supplied JSON with no server-side size
 * limit. The metadata tooltip used to mount `JSONView` unconditionally,
 * freezing the tab on hover for a large payload -- the same failure mode
 * already fixed for trace IO table cells (`IOTableCell.tsx`, gated on
 * `IO_TABLE_CHAR_LIMIT`). These tests prove the score metadata tooltip is
 * gated the same way.
 */
describe("ScoreRow metadata tooltip size gate", () => {
  it("renders the full JSON tree for metadata under the char limit", async () => {
    mockMetadata.current = { key: "value" };
    renderScoreRow();

    await openMetadataTooltip(/"key":"value"/);

    // Tooltip content portals outside the RTL `container` (into a layer
    // under `document.body`), so assert against the whole document.
    await waitFor(() => {
      expect(document.body.textContent).toContain("key");
      expect(document.body.textContent).toContain("value");
    });
    expect(document.body.textContent).not.toContain("too large");
  });

  it("falls back to a truncated preview for metadata over the char limit", async () => {
    mockMetadata.current = { blob: "x".repeat(IO_TABLE_CHAR_LIMIT + 50) };
    renderScoreRow();

    await openMetadataTooltip(/"blob":"x+/);

    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "too large to preview in full and was truncated",
      );
    });
  });
});
