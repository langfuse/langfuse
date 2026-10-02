import preview from "@/.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps, useState } from "react";
import { SessionConversationSidebar } from "./SessionConversationSidebar";

type Props = ComponentProps<typeof SessionConversationSidebar>;
const loadedArgs = {
  state: "loaded",
  traces: [
    {
      trace: {
        id: "turn-1",
        name: "Configure tracing",
        timestamp: new Date(0),
        environment: "production",
        userId: null,
        observationCount: 1,
        latencyMs: 1000,
        scores: [],
      },
      turnNumber: 1,
      idleGapSeconds: null,
      transcriptRows: [
        {
          id: "0:0",
          observationId: "generation-1",
          role: "system",
          label: "You are a helpful assistant.",
        },
        {
          id: "0:1",
          observationId: "generation-1",
          role: "user",
          label: "How do I configure tracing?",
        },
        {
          id: "0:2",
          observationId: "generation-1",
          role: "assistant",
          label: "Let me check the documentation.",
        },
        {
          id: "0:3",
          observationId: "generation-1",
          role: "tool",
          label: "search_documentation",
        },
        {
          id: "0:4",
          observationId: "generation-1",
          role: "assistant",
          label: "Initialize the SDK to start tracing.",
        },
      ],
    },
  ],
  activeTraceId: "turn-1",
  search: "",
  onSearchChange: fn(),
  expandedTraceIds: new Set(["turn-1"]),
  onToggleTraceExpanded: fn(),
  onSelect: fn(),
  onVisibleTraceIdsChange: fn(),
  isLoadingTranscripts: false,
  transcriptLoadError: false,
} satisfies Extract<Props, { state: "loaded" }>;

function SessionConversationSidebarStory(args: Props) {
  const [search, setSearch] = useState(
    args.state === "loaded" ? args.search : "",
  );
  const [expandedTraceIds, setExpandedTraceIds] = useState(
    args.state === "loaded" ? args.expandedTraceIds : new Set<string>(),
  );
  if (args.state === "loading")
    return (
      <div className="h-screen w-[296px]">
        <SessionConversationSidebar state="loading" />
      </div>
    );
  const normalizedSearch = search.trim().toLowerCase();
  const traces = normalizedSearch
    ? args.traces.flatMap((trace) => {
        const transcriptRows = trace.transcriptRows?.filter((row) =>
          `${row.role} ${row.label}`.toLowerCase().includes(normalizedSearch),
        );
        if (transcriptRows?.length === 0) return [];
        return [{ ...trace, transcriptRows }];
      })
    : args.traces;
  return (
    <div className="h-screen w-[296px]">
      <SessionConversationSidebar
        {...args}
        traces={traces}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          args.onSearchChange(value);
        }}
        expandedTraceIds={expandedTraceIds}
        onToggleTraceExpanded={(id) => {
          setExpandedTraceIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
          args.onToggleTraceExpanded(id);
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  component: SessionConversationSidebar,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: (args) => <SessionConversationSidebarStory {...args} />,
});
export default meta;
export const Default = meta.story({ args: loadedArgs });
export const DarkMode = meta.story({
  args: loadedArgs,
  globals: { theme: "dark" },
});
export const Loading = meta.story({ args: { state: "loading" } });
export const Empty = meta.story({ args: { ...loadedArgs, traces: [] } });
export const Error = meta.story({
  args: {
    ...loadedArgs,
    traces: [{ ...loadedArgs.traces[0]!, transcriptRows: null }],
  },
});
export const SelectMessagesAndTools = meta.story({
  name: "(Test) Select messages and tools",
  args: loadedArgs,
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Filter observations" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await canvas.findByRole("button", { name: "tool: search_documentation" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:3");
    await userEvent.click(
      canvas.getByRole("button", {
        name: "assistant: Initialize the SDK to start tracing.",
      }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:4");
  },
});
