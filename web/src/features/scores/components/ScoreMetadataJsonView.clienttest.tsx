import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import {
  ScoreMetadataJsonView,
  useStringifiedMetadata,
} from "@/src/features/scores/components/ScoreMetadataJsonView";
import { IO_TABLE_CHAR_LIMIT } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownContextProvider } from "@/src/features/theming/useMarkdownContext";

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

const renderView = (props: {
  metadata: unknown;
  stringified: string | undefined;
}) =>
  render(
    <MarkdownContextProvider>
      <ScoreMetadataJsonView {...props} />
    </MarkdownContextProvider>,
  );

/**
 * Score `metadata` is arbitrary user-supplied JSON with no server-side size
 * limit. Mounting the full `JSONView` tree for a large payload freezes the
 * tab on hover -- the same failure mode already fixed for trace IO table
 * cells (`IOTableCell.tsx`, gated on `IO_TABLE_CHAR_LIMIT`). This proves the
 * shared metadata JSON view falls back to a truncated preview above the
 * limit instead of mounting the full tree.
 */
describe("ScoreMetadataJsonView size gate", () => {
  it("renders the full JSON tree for metadata under the char limit", () => {
    const metadata = { key: "value" };
    const stringified = JSON.stringify(metadata);

    renderView({ metadata, stringified });

    expect(screen.getByText("key")).toBeInTheDocument();
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument();
  });

  it("falls back to a truncated preview for metadata over the char limit", () => {
    const metadata = { blob: "x".repeat(IO_TABLE_CHAR_LIMIT + 50) };
    const stringified = JSON.stringify(metadata);
    expect(stringified.length).toBeGreaterThan(IO_TABLE_CHAR_LIMIT);

    const { container } = renderView({ metadata, stringified });

    expect(container.textContent).toContain("truncated");
    expect(container.textContent).toContain(
      "too large to preview in full and was truncated",
    );
    // The gate must not render the untruncated payload into the DOM.
    expect(container.textContent!.length).toBeLessThan(stringified.length);
  });
});

describe("useStringifiedMetadata", () => {
  it("returns undefined for null/undefined metadata", () => {
    const { result } = renderHook(() => useStringifiedMetadata(undefined));
    expect(result.current).toBeUndefined();
  });

  it("stringifies object metadata", () => {
    const { result } = renderHook(() =>
      useStringifiedMetadata({ a: 1, b: "two" }),
    );
    expect(result.current).toBe(JSON.stringify({ a: 1, b: "two" }));
  });
});
