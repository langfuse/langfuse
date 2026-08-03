/**
 * The eager JSON Beta viewer builds the full node tree on the main thread, so a
 * field with too many nodes freezes the tab (LFE-10847). These tests pin the
 * node-count gate + its P2 resolution: an over-limit field renders as a
 * `hideData` section (the eager viewer builds no tree for it) whose footer is
 * the **lazy** byte-engine viewer (main thread, cost proportional to what's
 * expanded) plus a download escape hatch — NOT the old "too large" dead-end.
 * Normal fields (including a huge single string, which is only one node) render
 * with their data as before. (A string is 1 node, so it is never node-gated
 * here; gated ⟹ structured.)
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

// Capture the props CorrectedOutputField receives — the diff dialog it mounts
// JSON.stringifies `actualOutput` unmemoized on every render, so an oversized
// output must NOT be handed to it. `vi.hoisted` so the holder exists when the
// hoisted mock factory runs.
const correctedField = vi.hoisted(() => ({
  props: undefined as
    | { actualOutput?: unknown; actualOutputTooLarge?: boolean }
    | undefined,
}));
vi.mock("./components/CorrectedOutputField", () => ({
  CorrectedOutputField: (props: {
    actualOutput?: unknown;
    actualOutputTooLarge?: boolean;
  }) => {
    // Read each field explicitly (not the whole object) so the capture is
    // exactly what the tests assert — and to satisfy react/no-unused-prop-types.
    correctedField.props = {
      actualOutput: props.actualOutput,
      actualOutputTooLarge: props.actualOutputTooLarge,
    };
    return <div data-testid="corrected-output" />;
  },
}));

// The lazy renderer runs a byte engine + virtualizer; stub it to a marker so
// these tests assert the gated field is routed to it, not its internals.
vi.mock(
  "@/src/components/ui/AdvancedJsonViewer/lazy/react/LazyJsonViewer",
  () => ({
    LazyJsonViewer: () => <div data-testid="lazy-json-viewer" />,
  }),
);

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

// Unicode decoding is orthogonal to the size gate; a spy that returns identity
// keeps existing tests focused while letting one test assert the all-or-nothing
// decode rule. A small MAX_NODES makes "over budget" cheap to trigger.
const decodeMock = vi.hoisted(() => ({
  spy: vi.fn((value: unknown) => value),
  MAX_NODES: 10,
}));
vi.mock("@/src/utils/decodeUnicodeInJson", () => ({
  decodeUnicodeInJson: decodeMock.spy,
  DECODE_UNICODE_MAX_NODES: decodeMock.MAX_NODES,
}));

import { IOPreviewJSON } from "./IOPreviewJSON";
import { JSON_VIEW_RENDER_ROW_LIMIT } from "./lib/jsonViewSizeGate";

const FALLBACK_TEXT = /too large to render in JSON view/i;

// An array of N primitives is N+1 rows (array node + N elements) and is cheap
// to build — no giant nested object needed to cross the node limit.
const manyRows = () =>
  Array.from({ length: JSON_VIEW_RENDER_ROW_LIMIT }, (_, i) => i);

// A field big enough to need windowing but well under the old 50k limit. This
// "dead zone" (3,333–50,000 rows) used to fall to the eager virtualized viewer,
// which synchronously builds+renders the whole node set — a 44k-row big-number
// output pegged the main thread ~4 min (LFE-10847). It must now route to the
// lazy viewer, same as any over-threshold field. Fixed count, independent of the
// gate constant, so it keeps guarding the regression if the constant moves.
const deadZoneRows = () => Array.from({ length: 5_000 }, (_, i) => i);

describe("IOPreviewJSON node-count gating", () => {
  it("routes a dead-zone field (thousands of rows) to the lazy viewer, not the eager tree", () => {
    render(
      <IOPreviewJSON
        input={deadZoneRows()}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    // Gated → lazy viewer + download hatch; the eager viewer builds no tree.
    expect(screen.getByTestId("lazy-json-viewer")).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId("section-input__oversized")).toHaveAttribute(
      "data-hide-data",
      "true",
    );
    expect(screen.queryByTestId("data-input")).not.toBeInTheDocument();
  });

  it("renders an over-limit field lazily with a download hatch (no dead-end)", () => {
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

    // The gated structured field is now RENDERED via the lazy viewer, with the
    // download as a secondary escape hatch — not the old "too large" dead-end.
    expect(screen.getByTestId("lazy-json-viewer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    // Its section still carries NO data, so the EAGER viewer builds no tree for
    // it. The gated section uses a collapse-isolated key (`__oversized`), never
    // the plain field key, so it cannot inherit a persisted collapsed state.
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

  it("names the download-hatch size in rows (node-count gate), not characters", () => {
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
    // Node-count gate → the download hatch's size note names rows, not chars.
    expect(screen.getByText(/\brows\b/i)).toBeInTheDocument();
    expect(screen.queryByText(/\bcharacters\b/i)).not.toBeInTheDocument();
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

  it("does not hand an oversized output to the correction diff (avoids per-render re-stringify)", () => {
    // Regression (LFE-10847 review 🔴): CorrectedOutputField always mounts the
    // diff dialog, which JSON.stringifies `actualOutput` unmemoized in its
    // render body — so handing it the full oversized output re-serializes
    // megabytes on every render/keystroke. A gated output must reach it as
    // undefined (actualOutputTooLarge=true drives the "too large to diff"
    // branch); the decoded value still feeds the lazy viewer/probe separately.
    render(
      <IOPreviewJSON
        output={manyRows()}
        hideInput
        hideIfNull={false}
        showCorrections={true}
        projectId="p"
        traceId="t"
      />,
    );
    expect(correctedField.props?.actualOutputTooLarge).toBe(true);
    expect(correctedField.props?.actualOutput).toBeUndefined();
  });

  it("still hands a small (non-gated) output to the correction diff", () => {
    render(
      <IOPreviewJSON
        output={{ answer: "ok" }}
        hideInput
        hideIfNull={false}
        showCorrections={true}
        projectId="p"
        traceId="t"
      />,
    );
    expect(correctedField.props?.actualOutputTooLarge).toBe(false);
    expect(correctedField.props?.actualOutput).toEqual({ answer: "ok" });
  });

  it("decodes unicode for a field within the decode budget", () => {
    decodeMock.spy.mockClear();
    render(
      <IOPreviewJSON
        output={{ answer: "ok" }}
        hideInput
        hideIfNull={false}
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );
    expect(decodeMock.spy).toHaveBeenCalledWith({ answer: "ok" });
  });

  it("skips decode for a field over the budget — shown raw, never partial/mixed", () => {
    // decodeUnicodeInJson caps at DECODE_UNICODE_MAX_NODES and copies the rest
    // un-decoded; since the same value backs the viewer AND the raw download, a
    // larger field would export mixed decoded/escaped unicode. Over the budget
    // (here 10) the field must NOT be decoded at all (LFE-10847 review 🟡).
    decodeMock.spy.mockClear();
    render(
      <IOPreviewJSON
        output={manyRows()} // 3,334 rows ≫ budget
        hideInput
        hideIfNull={false}
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );
    const decodedArgs = decodeMock.spy.mock.calls.map((c) => c[0]);
    // The oversized array was never handed to the decoder (all-or-nothing).
    expect(
      decodedArgs.some(
        (v) => Array.isArray(v) && v.length > decodeMock.MAX_NODES,
      ),
    ).toBe(false);
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
