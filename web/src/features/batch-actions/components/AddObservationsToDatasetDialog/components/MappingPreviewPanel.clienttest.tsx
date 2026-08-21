/**
 * The source/result preview panes used to render a full observation's
 * input/output through the unvirtualized JSONView (react18-json-view) with no
 * size gate — the same freeze-on-mount bug already fixed for the trace IO
 * views. A verbose observation (large agent context/tool output) could freeze
 * this dialog on open. These tests pin the branch selection: an over-limit
 * field renders the bounded fallback and never mounts JSONView, while normal
 * fields render exactly as before.
 */
import { render, screen } from "@testing-library/react";
import type * as CodeJsonViewerModule from "@/src/components/ui/CodeJsonViewer";
import { JSON_VIEW_RENDER_CHAR_LIMIT } from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

// JSONView is the unvirtualized render path we must NOT reach for over-limit
// fields — mock it so its presence is observable by test id.
vi.mock("@/src/components/ui/CodeJsonViewer", async () => {
  const actual = await vi.importActual<typeof CodeJsonViewerModule>(
    "@/src/components/ui/CodeJsonViewer",
  );
  return {
    ...actual,
    JSONView: (props: { title?: string }) => (
      <div data-testid="json-view">{props.title}</div>
    ),
  };
});

// Minimal stand-in for the shared barrel: only what MappingPreviewPanel uses
// at runtime. applyFieldMappingConfig here just passes the requested source
// field through unchanged, which is enough to control resultData from the
// test without needing the real (heavy) @langfuse/shared package built.
vi.mock("@langfuse/shared", () => ({
  applyFieldMappingConfig: ({
    observation,
    defaultSourceField,
  }: {
    observation: Record<string, unknown>;
    defaultSourceField: string;
  }) => ({
    value: observation[defaultSourceField],
    misses: [],
    errors: [],
  }),
  validateFieldAgainstSchema: () => ({ isValid: true, errors: [] }),
}));

import { MappingPreviewPanel } from "./MappingPreviewPanel";

const FALLBACK_TEXT = /too large to render in JSON view/i;

const config = {
  mode: "custom",
  custom: { type: "root", rootConfig: { sourceField: "output" } },
} as unknown as Parameters<typeof MappingPreviewPanel>[0]["config"];

describe("MappingPreviewPanel JSON size gating", () => {
  it("renders the fallback and NOT JSONView for an over-limit source field", () => {
    const hugeOutput = { blob: "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT + 1) };
    render(
      <MappingPreviewPanel
        fieldLabel="Input"
        defaultSourceField="output"
        config={config}
        observationData={{ input: {}, output: hugeOutput, metadata: {} }}
        isLoading={false}
      />,
    );

    expect(screen.getAllByText(FALLBACK_TEXT).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });

  it("renders JSONView (not the fallback) for a normal-size observation", () => {
    render(
      <MappingPreviewPanel
        fieldLabel="Input"
        defaultSourceField="output"
        config={config}
        observationData={{
          input: {},
          output: { role: "assistant", content: "hi" },
          metadata: {},
        }}
        isLoading={false}
      />,
    );

    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    expect(screen.getAllByTestId("json-view").length).toBeGreaterThan(0);
  });
});
