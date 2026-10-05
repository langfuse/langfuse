import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionConversationSidebar } from "./SessionConversationSidebar";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 160,
        size: 160,
        end: (index + 1) * 160,
      })),
    getTotalSize: () => count * 160,
    scrollToIndex: vi.fn(),
    scrollToOffset: vi.fn(),
  }),
}));
vi.mock("@/src/features/sessions/SessionVirtualizedRow", () => ({
  SessionVirtualizedRow: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const loadedProps = {
  state: "loaded",
  traces: [
    {
      trace: {
        id: "trace",
        name: "Turn",
        timestamp: new Date(0),
        environment: "production",
        userId: null,
        observationCount: 1,
        latencyMs: 1000,
        scores: [],
      },
      turnNumber: 2,
      idleGapSeconds: null,
      transcriptRows: [
        {
          id: "0:0",
          observationId: "generation",
          role: "user",
          label: "Question",
        },
        {
          id: "0:1",
          observationId: "generation",
          role: "assistant",
          label: "Answer",
        },
        {
          id: "0:2",
          observationId: "generation",
          role: "tool",
          label: "search",
        },
      ],
    },
  ],
  activeTraceId: "trace",
  search: "",
  expandedTraceIds: new Set(["trace"]),
  onSearchChange: vi.fn(),
  onToggleTraceExpanded: vi.fn(),
  onSelect: vi.fn(),
  onVisibleTraceIdsChange: vi.fn(),
  isLoadingTranscripts: false,
  transcriptLoadError: false,
} satisfies Extract<
  ComponentProps<typeof SessionConversationSidebar>,
  { state: "loaded" }
>;

describe("SessionConversationSidebar", () => {
  it("labels roles and selects exact message and tool rows without filter controls", () => {
    const onSelect = vi.fn();
    render(<SessionConversationSidebar {...loadedProps} onSelect={onSelect} />);
    expect(screen.queryByText("user")).not.toBeInTheDocument();
    expect(screen.queryByText("assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("tool")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Filter observations" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Assistant message" }));
    expect(onSelect).toHaveBeenCalledWith(1, "generation", "0:1");
    fireEvent.click(screen.getByRole("button", { name: "tool: search" }));
    expect(onSelect).toHaveBeenCalledWith(1, "generation", "0:2");
  });

  it("forwards search and collapse actions", () => {
    const onSearchChange = vi.fn();
    const onToggleTraceExpanded = vi.fn();
    const { rerender } = render(
      <SessionConversationSidebar
        {...loadedProps}
        onSearchChange={onSearchChange}
        onToggleTraceExpanded={onToggleTraceExpanded}
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search messages and tools" }),
      { target: { value: "answer" } },
    );
    expect(onSearchChange).toHaveBeenCalledWith("answer");
    fireEvent.click(screen.getByRole("button", { name: "Collapse turn" }));
    expect(onToggleTraceExpanded).toHaveBeenCalledWith("trace");
    rerender(
      <SessionConversationSidebar
        {...loadedProps}
        expandedTraceIds={new Set()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Assistant message" }),
    ).not.toBeInTheDocument();
  });

  it("renders transcript loading, error, and empty states", () => {
    const { rerender } = render(<SessionConversationSidebar state="loading" />);
    expect(screen.getByRole("complementary")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    rerender(
      <SessionConversationSidebar
        {...loadedProps}
        traces={[]}
        isLoadingTranscripts
      />,
    );
    expect(screen.getByText("Loading transcripts...")).toBeInTheDocument();
    rerender(
      <SessionConversationSidebar
        {...loadedProps}
        traces={[{ ...loadedProps.traces[0]!, transcriptRows: null }]}
      />,
    );
    expect(screen.getByText("Failed to load transcript")).toBeInTheDocument();
    rerender(
      <SessionConversationSidebar
        {...loadedProps}
        traces={[]}
        search="missing"
      />,
    );
    expect(screen.getByText("No matching turns")).toBeInTheDocument();
  });
});
