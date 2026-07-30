/**
 * The JSON view must never hand a multi-MB field to the unvirtualized
 * react18-json-view (LFE-10989). These tests pin the branch selection in
 * IOPreviewJSONSimple: over-limit fields render the bounded fallback and skip
 * PrettyJsonView entirely, while normal fields render exactly as before.
 */
import { fireEvent, render, screen } from "@testing-library/react";

// PrettyJsonView is the unvirtualized render path we must NOT reach for
// over-limit fields — mock it so its presence is observable by test id.
vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: (props: { title?: string }) => (
    <div data-testid="pretty-json-view">{props.title}</div>
  ),
}));

vi.mock("./components/CorrectedOutputField", () => ({
  CorrectedOutputField: () => <div data-testid="corrected-output" />,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

// deepParseJson is the only runtime import from the shared barrel here; stub it
// so the test stays light and deterministic (identity is fine for these cases).
vi.mock("@langfuse/shared", () => ({
  deepParseJson: (value: unknown) => value,
}));

import { IOPreviewJSONSimple } from "./IOPreviewJSONSimple";
import { JSON_VIEW_RENDER_CHAR_LIMIT } from "./lib/jsonViewSizeGate";

const FALLBACK_TEXT = /too large to render in JSON view/i;

describe("IOPreviewJSONSimple size gating", () => {
  it("renders the fallback and NOT PrettyJsonView for an over-limit field", () => {
    const huge = "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT + 1);
    render(
      <IOPreviewJSONSimple
        input={huge}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    // Fallback shown for the input field...
    expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download Input/i }),
    ).toBeInTheDocument();
    // ...and the unvirtualized viewer was never mounted.
    expect(screen.queryByTestId("pretty-json-view")).not.toBeInTheDocument();
  });

  it("downloads a string field as raw text (.txt), not JSON-wrapped", () => {
    // The huge-IO seed is a base64 string; JSON.stringify-ing it would add
    // quotes + escapes and over-encode the download. The fallback must write
    // the raw text.
    const rawString = "eyJhIjoxfQ==" + "A".repeat(JSON_VIEW_RENDER_CHAR_LIMIT);
    const blobCalls: { part: string; type: string }[] = [];
    let downloadName = "";

    // Capture the exact content handed to the Blob (jsdom's Blob has no
    // readable .text() in this env, so intercept at construction).
    class MockBlob {
      type: string;
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        this.type = opts?.type ?? "";
        blobCalls.push({ part: String(parts[0]), type: this.type });
      }
    }
    vi.stubGlobal("Blob", MockBlob);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    // Capture the download filename and neutralize navigation.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadName = this.download;
    });

    render(
      <IOPreviewJSONSimple
        input={rawString}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Download Input/i }));

    expect(blobCalls).toHaveLength(1);
    expect(blobCalls[0].part).toBe(rawString); // raw, no surrounding quotes
    expect(blobCalls[0].part.startsWith('"')).toBe(false);
    expect(blobCalls[0].type).toContain("text/plain");
    expect(downloadName).toBe("input-t.txt");

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hides a null field with hideIfNull and shows no fallback", () => {
    render(
      <IOPreviewJSONSimple
        input={null}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByTestId("pretty-json-view")).not.toBeInTheDocument();
  });

  it("renders PrettyJsonView (not the fallback) for normal small I/O", () => {
    render(
      <IOPreviewJSONSimple
        input={{ messages: [{ role: "user", content: "hi" }] }}
        hideOutput
        hideIfNull
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    const viewers = screen.getAllByTestId("pretty-json-view");
    expect(viewers).toHaveLength(1);
    expect(viewers[0]).toHaveTextContent("Input");
    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
  });
});
