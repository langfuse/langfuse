import { render, screen } from "@testing-library/react";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { IO_TABLE_CHAR_LIMIT } from "@/src/components/ui/CodeJsonViewer";
import type * as CodeJsonViewerModule from "@/src/components/ui/CodeJsonViewer";

// JSONView is the unvirtualized react18-json-view render path; mock it so its
// received `json` prop and presence are observable by test id.
vi.mock("@/src/components/ui/CodeJsonViewer", async () => {
  const actual = await vi.importActual<typeof CodeJsonViewerModule>(
    "@/src/components/ui/CodeJsonViewer",
  );
  return {
    ...actual,
    JSONView: (props: { json?: unknown }) => (
      <div data-testid="json-view">{JSON.stringify(props.json)}</div>
    ),
  };
});

const TRUNCATED_TEXT = /Content was truncated/i;

/**
 * Regression (this fix): the hover-card preview (`enableExpandOnHover`) used
 * to render `data` directly through the unvirtualized react18-json-view with
 * NO size gate at all — bypassing the char-limit truncation the inline cell
 * already applies. Hovering a large field could freeze the tab even though
 * the inline cell right next to it was protected. This pins that the hover
 * card now reuses the same gated renderer (`IOTableCellContent`) as the
 * inline cell, so no JSONView instance it mounts ever receives the raw
 * over-limit payload.
 */
describe("IOTableCell hover-card size gating", () => {
  it("gates the hover-card preview, not just the inline cell", () => {
    const payload = "x".repeat(IO_TABLE_CHAR_LIMIT + 1);

    render(<IOTableCell data={payload} enableExpandOnHover />);

    expect(screen.getByText(TRUNCATED_TEXT)).toBeInTheDocument();
    const views = screen.getAllByTestId("json-view");
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) {
      expect(view.textContent).not.toBe(JSON.stringify(payload));
    }
  });

  it("renders normally for a small field with hover enabled", () => {
    render(<IOTableCell data={{ answer: "ok" }} enableExpandOnHover />);

    expect(screen.queryByText(TRUNCATED_TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });
});
