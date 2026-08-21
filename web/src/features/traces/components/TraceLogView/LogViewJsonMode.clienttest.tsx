/**
 * LogViewJsonMode combines EVERY observation's input/output/metadata into one
 * object and renders it through the unvirtualized react18-json-view
 * (JSONView). Unlike the per-field trace I/O views (IOPreviewJSONSimple,
 * IOPreviewJSON), this path had NO size gate at all: the only existing guard
 * (`!isVirtualized` in TraceLogView.tsx) bounds observation COUNT (< 350), not
 * payload SIZE — a trace with a moderate observation count but verbose I/O
 * (long agent/RAG contexts) still froze the tab here. These tests pin the
 * size gate added to close that gap.
 */
import { render, screen } from "@testing-library/react";
import { LogViewJsonMode } from "./LogViewJsonMode";
import {
  JSON_VIEW_RENDER_CHAR_LIMIT,
  JSON_VIEW_RENDER_ROW_LIMIT,
} from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";
import type { ObservationIOData } from "./useLogViewAllObservationsIO";

// JSONView is the unvirtualized render path this gate must avoid reaching for
// oversized data; mock it so its presence/absence is observable by test id.
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: (props: { json?: unknown }) => (
    <div data-testid="json-view">{JSON.stringify(props.json)}</div>
  ),
}));

vi.mock("@/src/components/design-system/Spinner/Spinner", () => ({
  default: () => <div data-testid="spinner" />,
}));

const hookState = vi.hoisted(() => ({
  data: null as ObservationIOData[] | null,
}));

vi.mock("./useLogViewAllObservationsIO", () => ({
  useLogViewAllObservationsIO: () => ({
    data: hookState.data,
    isLoading: false,
    isError: false,
    loadAllData: vi.fn(),
    totalCount: hookState.data?.length ?? 0,
  }),
}));

const baseObservation = (
  overrides: Partial<ObservationIOData> & { id: string },
): ObservationIOData => ({
  type: "SPAN",
  name: "step",
  startTime: new Date("2024-01-01T00:00:00.000Z"),
  depth: 0,
  ...overrides,
});

const FALLBACK_TEXT = /too large to render in JSON view/i;

describe("LogViewJsonMode size gating", () => {
  it("renders the fallback and NOT JSONView when the combined payload exceeds the char limit", () => {
    hookState.data = [
      baseObservation({
        id: "o1",
        output: "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT + 1),
      }),
    ];

    render(
      <LogViewJsonMode
        items={[]}
        traceId="t1"
        projectId="p1"
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />,
    );

    expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download All observations/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });

  it("renders the fallback for many observations with small individual payloads but a high combined node count", () => {
    // Each observation is tiny on its own (a couple of short fields), but
    // enough of them combine into a node count that blows past the row gate
    // while staying well under the char gate — the exact "count guard passes,
    // size still freezes the tab" scenario this fix closes.
    hookState.data = Array.from(
      { length: JSON_VIEW_RENDER_ROW_LIMIT },
      (_, i) => baseObservation({ id: `o${i}`, output: i }),
    );

    render(
      <LogViewJsonMode
        items={[]}
        traceId="t1"
        projectId="p1"
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />,
    );

    expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });

  it("renders JSONView normally for a small combined payload", () => {
    hookState.data = [
      baseObservation({ id: "o1", input: { q: "hi" }, output: { a: "ok" } }),
      baseObservation({ id: "o2", output: "short" }),
    ];

    render(
      <LogViewJsonMode
        items={[]}
        traceId="t1"
        projectId="p1"
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />,
    );

    expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });
});
