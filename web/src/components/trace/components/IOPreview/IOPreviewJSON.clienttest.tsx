/**
 * The JSON Beta viewer virtualizes the DOM but still builds the full node tree
 * on the main thread, so a field with too many nodes (a large conversation /
 * deeply nested JSON) freezes the tab even here (LFE-10847). These tests pin the
 * node-count gate in IOPreviewJSON: over-limit fields render the bounded
 * fallback and are NEVER handed to MultiSectionJsonViewer, while normal fields
 * (including a huge single string, which is only one node) render as before.
 */
import { render, screen } from "@testing-library/react";

// MultiSectionJsonViewer is the tree-building path we must NOT reach for
// over-limit fields — mock it and expose the section keys it receives.
vi.mock(
  "@/src/components/ui/AdvancedJsonViewer/MultiSectionJsonViewer",
  () => ({
    MultiSectionJsonViewer: (props: { sections: { key: string }[] }) => (
      <div data-testid="multi-section-viewer">
        {props.sections.map((s) => s.key).join(",")}
      </div>
    ),
  }),
);

vi.mock("./components/CorrectedOutputField", () => ({
  CorrectedOutputField: () => <div data-testid="corrected-output" />,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock(
  "@/src/components/ui/AdvancedJsonViewer/hooks/useJsonViewPreferences",
  () => ({
    useJsonViewPreferences: () => ({
      stringWrapMode: "truncate",
      setStringWrapMode: vi.fn(),
    }),
  }),
);

// deepParseJson is the only runtime import from the shared barrel here; stub it
// to identity so the test stays light and deterministic.
vi.mock("@langfuse/shared", () => ({
  deepParseJson: (value: unknown) => value,
}));

// Unicode decoding is orthogonal to the size gate under test; identity keeps
// the test focused (and avoids pulling shared's decode helper through the mock).
vi.mock("@/src/utils/decodeUnicodeInJson", () => ({
  decodeUnicodeInJson: (value: unknown) => value,
}));

import { IOPreviewJSON } from "./IOPreviewJSON";
import { JSON_VIEW_RENDER_ROW_LIMIT } from "./lib/jsonViewSizeGate";

const FALLBACK_TEXT = /too large to render in JSON view/i;

// An array of N primitives is N+1 rows (array node + N elements) and is cheap
// to build — no giant nested object needed to cross the node limit.
const manyRows = () =>
  Array.from({ length: JSON_VIEW_RENDER_ROW_LIMIT }, (_, i) => i);

describe("IOPreviewJSON node-count gating", () => {
  it("renders the fallback and never mounts the viewer for an over-limit field", () => {
    render(
      <IOPreviewJSON
        input={manyRows()}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    // The over-limit field was never handed to the tree-building viewer.
    expect(
      screen.queryByTestId("multi-section-viewer"),
    ).not.toBeInTheDocument();
  });

  it("lets a huge single STRING through (one node) — no fallback, viewer renders it", () => {
    // A 20 MB base64-style string is a single node: cheap for the virtualized
    // viewer (renders as a media chip). A char-based gate would wrongly gate it.
    const hugeString = "A".repeat(20_000_000);
    render(
      <IOPreviewJSON
        input={hugeString}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    const viewer = screen.getByTestId("multi-section-viewer");
    expect(viewer).toHaveTextContent("input");
  });

  it("gates only the over-limit field, keeping the rest in the viewer", () => {
    render(
      <IOPreviewJSON
        input={manyRows()}
        output={{ answer: "ok" }}
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    // Input fallback shown...
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    // ...and the viewer still renders, with output but NOT input.
    const viewer = screen.getByTestId("multi-section-viewer");
    expect(viewer).toHaveTextContent("output");
    expect(viewer).not.toHaveTextContent("input");
  });

  it("renders the viewer (no fallback) for normal small I/O", () => {
    render(
      <IOPreviewJSON
        input={{ messages: [{ role: "user", content: "hi" }] }}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId("multi-section-viewer")).toHaveTextContent(
      "input",
    );
  });
});
