import preview from "@/.storybook/preview";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
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

export const GroupedToolStatuses = meta.story({
  name: "(Test) Grouped Tool Status Indicators",
  args: {
    ...loadedArgs,
    traces: [
      {
        ...loadedArgs.traces[0]!,
        transcriptRows: [
          {
            id: "0:0",
            observationId: "search",
            role: "tool",
            label: "search",
            level: "ERROR",
            statusMessage: "Search timed out",
          },
          {
            id: "0:1",
            observationId: "fetch",
            role: "tool",
            label: "fetch",
            level: "ERROR",
          },
          {
            id: "0:2",
            observationId: "list",
            role: "tool",
            label: "list",
            level: "WARNING",
            statusMessage: "Results truncated",
          },
          {
            id: "0:3",
            observationId: "validate",
            role: "tool",
            label: "validate",
            level: "WARNING",
          },
          {
            id: "0:4",
            observationId: "cache",
            role: "tool",
            label: "cache",
            level: "DEFAULT",
          },
          {
            id: "0:5",
            observationId: "debug",
            role: "tool",
            label: "debug",
            level: "DEBUG",
          },
        ],
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    const errors = await canvas.findByLabelText("2 tool errors");
    await expect(errors).toBeVisible();
    await expect(canvas.getByLabelText("2 tool warnings")).toBeVisible();
    const button = canvas.getByRole("button", { name: /^Tool:/ });
    await userEvent.hover(button);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await waitFor(async () => {
      await expect(within(tooltip).getByText("search")).toBeVisible();
      await expect(within(tooltip).getByText("fetch")).toBeVisible();
      await expect(within(tooltip).getByText("list")).toBeVisible();
      await expect(within(tooltip).getByText("validate")).toBeVisible();
    });
    await expect(within(tooltip).getByText("Search timed out")).toBeVisible();
    await expect(within(tooltip).getByText("Results truncated")).toBeVisible();
    await expect(
      within(tooltip).getByRole("heading", { name: "Tool calls" }),
    ).toBeVisible();
    await expect(
      within(tooltip).getByRole("heading", { name: "Errors" }),
    ).toBeVisible();
    await expect(
      within(tooltip).getByRole("heading", { name: "Warnings" }),
    ).toBeVisible();
    await userEvent.click(button);
    await expect(args.onSelect).toHaveBeenCalledWith(0, "search", "0:0", "0:0");
  },
});

export const IndividualToolStatuses = meta.story({
  name: "(Test) Individual Tool Status Indicators",
  args: {
    ...loadedArgs,
    search: "search",
    traces: [
      {
        ...loadedArgs.traces[0]!,
        transcriptRows: [
          {
            id: "0:0",
            observationId: "failed",
            role: "tool",
            label: "search_failed",
            level: "ERROR",
            statusMessage: "Search timed out",
          },
          {
            id: "0:1",
            observationId: "partial",
            role: "tool",
            label: "search_partial",
            level: "WARNING",
            statusMessage: "Results truncated",
          },
          {
            id: "0:2",
            observationId: "healthy",
            role: "tool",
            label: "search_healthy",
            level: "DEFAULT",
            statusMessage: "Search completed",
          },
          {
            id: "0:3",
            observationId: "debug",
            role: "tool",
            label: "search_debug",
            level: "DEBUG",
            statusMessage: "Diagnostics enabled",
          },
        ],
      },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    if (args.state !== "loaded")
      throw new globalThis.Error("Expected loaded sidebar");
    await expect(
      await canvas.findByLabelText("Tool status: ERROR"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Tool status: WARNING")).toBeVisible();
    await expect(
      canvas.queryByLabelText("Tool status: DEFAULT"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByLabelText("Tool status: DEBUG"),
    ).not.toBeInTheDocument();
    const overlays = within(canvasElement.ownerDocument.body);
    const failed = canvas.getByRole("button", { name: "tool: search_failed" });
    await userEvent.hover(failed);
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Search timed out",
    );
    await waitFor(async () => {
      const tooltip = within(overlays.getByRole("tooltip"));
      await expect(tooltip.getByText("search_failed")).toBeVisible();
      await expect(tooltip.getByText("Search timed out")).toBeVisible();
    });
    await userEvent.unhover(failed);
    await waitFor(() =>
      expect(overlays.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    await userEvent.click(failed);
    await expect(args.onSelect).toHaveBeenCalledWith(0, "failed", "0:0");
    await userEvent.tab();
    await expect(
      canvas.getByRole("button", { name: "tool: search_partial" }),
    ).toHaveFocus();
    await expect(await overlays.findByRole("tooltip")).toHaveTextContent(
      "Results truncated",
    );
    await waitFor(async () => {
      const tooltip = within(overlays.getByRole("tooltip"));
      await expect(tooltip.getByText("search_partial")).toBeVisible();
      await expect(tooltip.getByText("Results truncated")).toBeVisible();
    });
  },
});
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
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /tool: search_documentation/i,
      }),
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
      name: "Search session",
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
      firstThread.getByRole("button", { name: /tool: apply_patch/i }),
    ).toBeInTheDocument();
    await userEvent.click(
      secondThread.getByRole("button", { name: /tool: read_file/i }),
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
      name: /^Tool:.*read_file.*apply_patch/,
    });
    await expect(group).not.toHaveAttribute("aria-expanded");
    await expect(
      canvas.queryByRole("button", { name: "tool: apply_patch" }),
    ).not.toBeInTheDocument();
    await userEvent.click(group);
    await expect(args.onSelect).toHaveBeenCalledWith(
      0,
      "generation-1",
      "0:0",
      "0:0",
    );
    await userEvent.type(canvas.getByRole("textbox"), "tool");
    await expect(
      canvas.queryByRole("button", { name: /^Tool:.*read_file.*apply_patch/ }),
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
      canvas.getByRole("button", { name: /^Tool:.*read_file.*apply_patch/ }),
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
    await userEvent.click(messages[1]!);
    await expect(args.onSelect).toHaveBeenCalledWith(0, "generation-2", "0:1");
    await userEvent.clear(canvas.getByRole("textbox"));
    await userEvent.type(canvas.getByRole("textbox"), "user");
    await expect(
      canvas.getAllByRole("button", { name: "User message" }),
    ).toHaveLength(2);
    await userEvent.clear(canvas.getByRole("textbox"));
    await expect(
      canvas.getByRole("button", { name: "2 User messages" }),
    ).toBeInTheDocument();
  },
});
