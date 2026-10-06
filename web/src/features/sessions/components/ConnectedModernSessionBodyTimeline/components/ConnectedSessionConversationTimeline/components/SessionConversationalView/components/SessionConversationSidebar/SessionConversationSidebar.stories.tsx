import preview from "@/.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps, useState } from "react";
import { SessionConversationSidebar } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationSidebar/SessionConversationSidebar";

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
export const DarkMode = meta.story({
  args: loadedArgs,
  globals: { theme: "dark" },
});
export const Empty = meta.story({ args: { ...loadedArgs, traces: [] } });
export const Error = meta.story({
  name: "(Test) Transcript Error",
  args: {
    ...loadedArgs,
    traces: [{ ...loadedArgs.traces[0]!, transcriptRows: null }],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Failed to load transcript"),
    ).toBeInTheDocument();
  },
});
export const SelectMessagesAndTools = meta.story({
  name: "(Test) Select messages and tools",
  args: loadedArgs,
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("user")).not.toBeInTheDocument();
    await expect(canvas.queryByText("assistant")).not.toBeInTheDocument();
    await expect(canvas.queryByText("tool")).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Thread 1" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Filter observations" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await canvas.findByRole("button", { name: "tool: search_documentation" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:3");
    await userEvent.click(
      canvas.getAllByRole("button", {
        name: "Assistant message",
      })[1]!,
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:4");
  },
});
export const SearchAndCollapse = meta.story({
  name: "(Test) Searches and Collapses Turns",
  args: loadedArgs,
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: "Search messages and tools",
    });
    await userEvent.type(input, "Initialize");
    await expect(args.onSearchChange).toHaveBeenLastCalledWith("Initialize");
    await expect(
      canvas.getByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse turn" }),
    );
    await expect(args.onToggleTraceExpanded).toHaveBeenCalledWith("turn-1");
    await expect(
      canvas.queryByRole("button", { name: "Assistant message" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Expand turn" }));
    await expect(
      canvas.getByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "missing");
    await expect(canvas.getByText("No matching turns")).toBeInTheDocument();
  },
});
export const MultipleThreads = meta.story({
  name: "(Test) Multiple Threads",
  args: {
    ...loadedArgs,
    traces: [
      {
        ...loadedArgs.traces[0]!,
        threadCount: 2,
        transcriptRows: [
          {
            id: "0:0",
            threadIndex: 0,
            observationId: "generation-1",
            role: "tool",
            label: "apply_patch",
          },
          {
            id: "1:0",
            threadIndex: 1,
            observationId: "generation-2",
            role: "tool",
            label: "read_file",
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    const firstThread = within(
      await canvas.findByRole("region", { name: "Thread 1" }),
    );
    const secondThread = within(
      canvas.getByRole("region", { name: "Thread 2" }),
    );
    await expect(
      firstThread.getByRole("button", { name: "tool: apply_patch" }),
    ).toBeInTheDocument();
    await userEvent.click(
      secondThread.getByRole("button", { name: "tool: read_file" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-2", "1:0");
    await userEvent.type(canvas.getByRole("textbox"), "apply_patch");
    await expect(
      canvas.getByRole("heading", { name: "Thread 1" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Thread 2" }),
    ).not.toBeInTheDocument();
  },
});
export const GroupedTools = meta.story({
  name: "(Test) Grouped Tools",
  args: {
    ...loadedArgs,
    traces: [
      {
        ...loadedArgs.traces[0]!,
        transcriptRows: [
          {
            id: "0:0",
            observationId: "generation-1",
            role: "tool",
            label: "read_file",
          },
          {
            id: "0:1",
            observationId: "generation-2",
            role: "tool",
            label: "apply_patch",
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    const group = await canvas.findByRole("button", {
      name: "Tools: 2 tool calls",
    });
    await expect(group).not.toHaveAttribute("aria-expanded");
    await expect(
      canvas.queryByRole("button", { name: "tool: apply_patch" }),
    ).not.toBeInTheDocument();
    await userEvent.hover(group);
    await expect(
      within(canvasElement.ownerDocument.body).findByRole("tooltip", {
        name: /read_file.*apply_patch/s,
      }),
    ).resolves.toHaveTextContent("read_file apply_patch");
    await userEvent.click(group);
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:0");
    await userEvent.type(canvas.getByRole("textbox"), "tool");
    await expect(
      canvas.queryByRole("button", { name: "Tools: 2 tool calls" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "tool: read_file" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "tool: apply_patch" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-2", "0:1");
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "PATCH");
    await expect(
      within(
        canvas.getByRole("button", { name: "tool: apply_patch" }),
      ).getByRole("mark"),
    ).toHaveTextContent("patch");
    await userEvent.clear(canvas.getByRole("textbox"));
    await expect(
      canvas.getByRole("button", { name: "Tools: 2 tool calls" }),
    ).toBeInTheDocument();
  },
});
export const ConsecutiveMessages = meta.story({
  name: "(Test) Consecutive Messages",
  args: {
    ...loadedArgs,
    traces: [
      {
        ...loadedArgs.traces[0]!,
        threadCount: 2,
        transcriptRows: [
          {
            id: "0:0",
            threadIndex: 0,
            observationId: "generation-1",
            role: "user",
            label: `${"Earlier context. ".repeat(30)}First NEEDLE request with needle details.${" Later context.".repeat(30)}`,
          },
          {
            id: "0:1",
            threadIndex: 0,
            observationId: "generation-2",
            role: "user",
            label: "More needle context",
          },
          {
            id: "0:2",
            threadIndex: 0,
            observationId: "generation-2",
            role: "assistant",
            label: "First response",
          },
          {
            id: "0:3",
            threadIndex: 0,
            observationId: "generation-3",
            role: "assistant",
            label: "More detail",
          },
          {
            id: "0:4",
            threadIndex: 0,
            observationId: "generation-3",
            role: "tool",
            label: "read_file",
          },
          {
            id: "0:5",
            threadIndex: 0,
            observationId: "generation-4",
            role: "assistant",
            label: "Done",
          },
          {
            id: "1:0",
            threadIndex: 1,
            observationId: "generation-5",
            role: "assistant",
            label: "Next thread",
          },
        ],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const canvas = within(canvasElement);
    const firstThread = within(
      await canvas.findByRole("region", { name: "Thread 1" }),
    );
    await userEvent.click(
      firstThread.getByRole("button", { name: "2 User messages" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-1", "0:0");
    await userEvent.click(
      firstThread.getByRole("button", { name: "2 Assistant messages" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-2", "0:2");
    await expect(
      firstThread.getByRole("button", { name: "Assistant message" }),
    ).toBeInTheDocument();
    await expect(
      within(canvas.getByRole("region", { name: "Thread 2" })).getByRole(
        "button",
        { name: "Assistant message" },
      ),
    ).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox"), "needle");
    const messages = canvas.getAllByRole("button", { name: "User message" });
    await expect(messages).toHaveLength(2);
    await expect(
      canvas.queryByRole("button", { name: "2 User messages" }),
    ).not.toBeInTheDocument();
    await expect(messages[0]).toHaveTextContent("…");
    await expect(within(messages[0]!).getAllByRole("mark")).toHaveLength(2);
    await expect(
      within(messages[0]!).getAllByRole("mark")[0],
    ).toHaveTextContent("NEEDLE");
    await userEvent.click(messages[1]!);
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-2", "0:1");
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "user");
    await expect(
      canvas.getAllByRole("button", { name: "User message" }),
    ).toHaveLength(2);
    await expect(canvas.queryAllByRole("mark")).toHaveLength(0);
    await userEvent.clear(canvas.getByRole("textbox"));
    await expect(
      canvas.getByRole("button", { name: "2 User messages" }),
    ).toBeInTheDocument();
  },
});
