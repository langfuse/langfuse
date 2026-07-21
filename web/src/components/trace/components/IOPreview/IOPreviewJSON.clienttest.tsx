/**
 * The JSON Beta viewer virtualizes the DOM but still builds the full node tree
 * on the main thread, so a field with too many nodes (a large conversation /
 * deeply nested JSON) freezes the tab even here (LFE-10847). These tests pin the
 * node-count gate in IOPreviewJSON: over-limit fields render as a `hideData`
 * section (so the viewer builds no tree) whose footer is the bounded fallback,
 * while normal fields (including a huge single string, which is only one node)
 * render with their data as before.
 */
import { render, screen } from "@testing-library/react";

// Mock MultiSectionJsonViewer: expose each section's key, whether it carries
// data (hideData=false) vs. is gated (hideData=true, tree never built), and
// render its footer so the fallback is observable.
vi.mock(
  "@/src/components/ui/AdvancedJsonViewer/MultiSectionJsonViewer",
  () => ({
    MultiSectionJsonViewer: (props: {
      sections: {
        key: string;
        hideData?: boolean;
        renderFooter?: (ctx: unknown) => React.ReactNode;
      }[];
    }) => (
      <div data-testid="multi-section-viewer">
        {props.sections.map((s) => (
          <div
            key={s.key}
            data-testid={`section-${s.key}`}
            data-hide-data={String(!!s.hideData)}
          >
            {!s.hideData && <span data-testid={`data-${s.key}`}>data</span>}
            {s.renderFooter ? s.renderFooter({}) : null}
          </div>
        ))}
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
  it("renders an over-limit field as a hideData section with the fallback footer", () => {
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

    // Fallback (with download) shown for the gated field...
    expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    // ...and its section carries NO data, so the viewer builds no tree for it.
    // The gated section uses a collapse-isolated key (`__oversized`), never the
    // plain field key, so it cannot inherit a persisted collapsed state.
    expect(screen.getByTestId("section-input__oversized")).toHaveAttribute(
      "data-hide-data",
      "true",
    );
    expect(screen.queryByTestId("data-input")).not.toBeInTheDocument();
  });

  it("gates under a collapse-isolated key, not the plain field key", () => {
    // The fallback's download escape hatch lives in the section footer, which
    // the viewer hides when the section is collapsed and persists that collapse
    // per section key. Reusing the plain field key would let a collapse from an
    // earlier trace (where the field rendered normally) silently hide the
    // fallback here. A distinct `__oversized` key keeps the two states separate.
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

    expect(screen.getByTestId("section-input__oversized")).toBeInTheDocument();
    expect(screen.queryByTestId("section-input")).not.toBeInTheDocument();
  });

  it("reports the node/row count as the reason, not a character count", () => {
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
    // Node-count gate → the summary names rows, not characters.
    expect(screen.getByText(/rows — too large to render/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/characters — too large to render/i),
    ).not.toBeInTheDocument();
  });

  it("lets a huge single STRING through (one node) — no fallback, data rendered", () => {
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
    expect(screen.getByTestId("section-input")).toHaveAttribute(
      "data-hide-data",
      "false",
    );
    expect(screen.getByTestId("data-input")).toBeInTheDocument();
  });

  it("gates only the over-limit field and keeps its position among sections", () => {
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

    // Input fallback shown, input section is gated (no data)...
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("section-input__oversized")).toHaveAttribute(
      "data-hide-data",
      "true",
    );
    // ...output still renders its data, and Input precedes Output (order kept).
    expect(screen.getByTestId("data-output")).toBeInTheDocument();
    const sections = screen.getAllByTestId(/^section-/);
    expect(sections.map((el) => el.getAttribute("data-testid"))).toEqual([
      "section-input__oversized",
      "section-output",
    ]);
  });

  it("renders normal small I/O with its data and no fallback", () => {
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
    expect(screen.getByTestId("data-input")).toBeInTheDocument();
  });
});
