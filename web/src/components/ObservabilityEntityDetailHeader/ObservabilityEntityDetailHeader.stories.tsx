import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import preview from "@/.storybook/preview";
import type { ComponentProps } from "react";
import { ObservabilityEntityDetailHeader } from "./ObservabilityEntityDetailHeader";
import { createPeekHeaderActions } from "./fns/createPeekHeaderActions";
import { SessionHeaderMetricsControl } from "@/src/features/sessions/SessionHeaderMetricsControl/SessionHeaderMetricsControl";
import {
  SquarePen,
  Plus,
  MessageSquare,
  Download,
  MoreVertical,
  ArrowUp,
  ArrowDown,
} from "@langfuse/icons";

const annotate = fn();
const onClose = fn();
const openInNewTab = fn();
const onToggle = fn();
const onValueChange = fn();
const removeValue = fn();
const removeLink = fn();
const createModel = fn();
const copyTraceId = fn();
const workflowAndPeekActions = [
  {
    id: "add-to",
    type: "button" as const,
    label: "Add to",
    icon: Plus,
    onClick: fn(),
  },
  {
    id: "annotate",
    type: "button" as const,
    label: "Annotate",
    icon: SquarePen,
    onClick: annotate,
  },
  {
    id: "comment",
    type: "button" as const,
    label: "Comment",
    icon: MessageSquare,
    onClick: fn(),
  },
  ...createPeekHeaderActions({
    onClose,
    openInNewTab,
    expand: { isExpanded: false, onToggle },
  }),
] as const;

const meta = preview.meta({
  component: ObservabilityEntityDetailHeader,
  args: {
    variant: "page",
    headerProps: {
      title: "Entity ID",
      itemType: "SESSION",
      actions: [
        {
          id: "annotate",
          type: "button",
          label: "Annotate",
          icon: SquarePen,
          onClick: annotate,
        },
      ],
    },
    metrics: [
      {
        id: "count",
        type: "value" as const,
        text: "3 traces",
        searchText: "3 traces",
      },
    ],
  } satisfies ComponentProps<typeof ObservabilityEntityDetailHeader>,
});

export const TestDropdownCountAndLoading = meta.story({
  name: "(Test) Dropdown Count And Loading",
  decorators: [
    (Story) => (
      <div className="w-[1200px]">
        <Story />
      </div>
    ),
  ],
  args: {
    headerProps: {
      title: "Session ID",
      itemType: "SESSION",
      actions: [
        {
          id: "add-to",
          type: "dropdown",
          label: "Add to",
          icon: Plus,
          count: 3,
          items: [],
        },
        {
          id: "download",
          type: "button",
          label: "Download JSON",
          icon: Download,
          isLoading: true,
          disabled: true,
          onClick: fn(),
        },
      ],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      within(canvas.getByRole("button", { name: "Add to" })).getByText("3"),
    ).toBeVisible();
    const download = canvas.getByRole("button", { name: "Download JSON" });
    await expect(download).toBeDisabled();
    await expect(download.querySelector(".animate-spin")).toBeInTheDocument();
  },
});

export const TestOverflowDropdownCountAndLoading = meta.story({
  name: "(Test) Overflow Dropdown Count And Loading",
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  args: TestDropdownCountAndLoading.input.args,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(async () => {
      await expect(
        within(
          await body.findByRole("menuitem", { name: /^Add to/ }),
        ).getByText("3"),
      ).toBeVisible();
    });
    await expect(
      body
        .getByRole("menuitem", { name: "Download JSON" })
        .querySelector(".animate-spin"),
    ).toBeInTheDocument();
  },
});

export const TestMetadataEditorAnchor = meta.story({
  name: "(Test) Metadata Editor Anchor",
  render: (args) => (
    <SessionHeaderMetricsControl
      projectId="project"
      countTraces={1}
      minTimestamp={new Date("2026-01-01")}
      maxTimestamp={new Date("2026-01-01")}
      tokensIn={0}
      tokensOut={0}
      totalTokens={0}
      totalCost={0}
      users={[]}
      scores={[]}
      metadataJsonPaths={{
        paths: [],
        source: { state: "empty" },
        onEditorOpenChange: fn(),
        onSave: fn(),
        onRemove: fn(),
      }}
    >
      {(metrics) => (
        <ObservabilityEntityDetailHeader {...args} metrics={metrics} />
      )}
    </SessionHeaderMetricsControl>
  ),
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Edit Metadata" });
    await userEvent.click(trigger);
    const editor = await body.findByRole("dialog", {
      name: "Add metadata JSONPath",
    });
    await waitFor(() => {
      expect(editor.getBoundingClientRect().left).toBeLessThanOrEqual(
        trigger.getBoundingClientRect().right,
      );
      expect(editor.getBoundingClientRect().right).toBeGreaterThanOrEqual(
        trigger.getBoundingClientRect().left,
      );
    });
    await userEvent.click(canvas.getByRole("button", { name: "Annotate" }));
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Add metadata JSONPath" }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(trigger);
    await body.findByRole("dialog", { name: "Add metadata JSONPath" });
    await userEvent.click(trigger);
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Add metadata JSONPath" }),
      ).not.toBeInTheDocument(),
    );
  },
});

export const Page = meta.story({
  name: "(Test) Page",
  play: async ({ canvas }) => {
    const header = within(canvas.getByRole("banner"));
    await expect(
      header.getByRole("heading", { name: "Entity ID" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Annotate" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("banner").getBoundingClientRect().right -
        header.getByRole("button", { name: "Annotate" }).getBoundingClientRect()
          .right,
    ).toBe(16);
    await expect(
      header
        .getAllByText("3 traces")
        .some((element) => element.getBoundingClientRect().width > 0),
    ).toBe(true);
  },
});

export const Observation = meta.story({
  name: "(Test) Observation",
  args: {
    headerProps: {
      title: "Generate response",
      itemType: "GENERATION",
      titleLevel: "ERROR",
    },
    metrics: [
      { id: "latency", type: "value", text: "1.2s", searchText: "latency 1.2" },
      {
        id: "cost",
        type: "missing-cost",
        projectId: "project",
        hasUsage: true,
        searchText: "no cost",
      },
      {
        id: "model",
        type: "model",
        model: "custom-model",
        onCreate: createModel,
        searchText: "model custom-model",
      },
      {
        id: "prompt",
        type: "link",
        href: "/project/project/prompts/chat?version=2",
        label: "prompt",
        text: "chat - v2",
        searchText: "prompt chat 2",
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Generate response" }),
    ).toBeVisible();
    await expect(canvas.getByText("Error", { exact: true })).toBeVisible();
    await expect(
      canvas
        .getAllByText("no cost", { exact: true })
        .some((element) => element.checkVisibility()),
    ).toBe(true);
    await expect(
      canvas.getByRole("link", { name: "prompt: chat - v2" }),
    ).toHaveAttribute("href", "/project/project/prompts/chat?version=2");
    await userEvent.click(canvas.getByRole("button", { name: "custom-model" }));
    await expect(createModel).toHaveBeenCalledOnce();
  },
});

export const ObservationMissingUsage = meta.story({
  name: "(Test) Observation Missing Usage",
  args: {
    headerProps: {
      title: "Generate response without usage",
      itemType: "GENERATION",
    },
    metrics: [
      {
        id: "usage-warning",
        type: "missing-usage",
        projectId: "project",
        searchText: "usage not submitted",
      },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { name: "Generate response without usage" }),
    ).toBeVisible();
    const usageBadge = canvas
      .getAllByText("usage not submitted", { exact: true })
      .find((element) => element.checkVisibility());
    if (!usageBadge) throw new Error("Usage warning is not visible");

    await userEvent.hover(usageBadge);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent(
      "No token usage was submitted for this generation.",
    );
    await expect(
      within(tooltip).getByRole("link", { name: "Model settings" }),
    ).toHaveAttribute("href", "/project/project/settings/models");
    await expect(
      within(tooltip).getByRole("link", { name: "Docs" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/features/token-and-cost-tracking#ingest-usage-and-cost-manually",
    );
  },
});

export const ObservationCost = meta.story({
  name: "(Test) Observation Cost Source",
  args: {
    metrics: [
      {
        id: "cost",
        type: "cost",
        text: "$0.03",
        searchText: "cost 0.03",
        details: { input: 0.01, output: 0.02, total: 0.03 },
        costSource: "provided",
      },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "$0.03" }));
    await expect(
      (
        await within(canvasElement.ownerDocument.body).findAllByText(
          "Provided at ingestion",
        )
      ).some((element) => element.checkVisibility()),
    ).toBe(true);
  },
});

export const TestLoadingMetrics = meta.story({
  name: "(Test) Loading Metrics",
  args: { isLoading: true, metrics: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("group", { name: "Entity metrics" }),
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("heading", { name: "Entity ID" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Annotate" }),
    ).toBeEnabled();
  },
});

export const TestRemovableMetrics = meta.story({
  name: "(Test) Removal Across Metric Types",
  args: {
    metrics: [
      {
        id: "value",
        type: "value",
        text: "Metadata",
        searchText: "Metadata",
        remove: { label: "Remove metadata", onClick: removeValue },
      },
      {
        id: "link",
        type: "link",
        text: "User",
        href: "#user",
        searchText: "User",
        remove: { label: "Remove user", onClick: removeLink },
      },
    ],
  },
  play: async ({ canvas }) => {
    const metadata = canvas
      .getAllByText("Metadata")
      .find((element) => element.checkVisibility());
    if (!metadata) throw new Error("Metadata metric is not visible");
    await userEvent.hover(metadata);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove metadata" }),
    );
    await expect(removeValue).toHaveBeenCalledOnce();
    await userEvent.hover(canvas.getByRole("link", { name: "User" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove user" }));
    await expect(removeLink).toHaveBeenCalledOnce();
  },
});

export const Peek = meta.story({
  name: "(Test) Peek",
  args: {
    variant: "peek",
    headerProps: {
      title: "Entity ID",
      itemType: "SESSION",
      actions: [
        {
          id: "annotate",
          type: "button",
          label: "Annotate",
          icon: SquarePen,
          onClick: annotate,
        },
        ...createPeekHeaderActions({ onClose }),
      ],
    },
  },
  play: async ({ canvas }) => {
    const header = within(canvas.getByRole("banner"));
    await expect(header.getByText("Entity ID")).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Annotate" }),
    ).toBeVisible();
    await expect(
      header.getByRole("group", { name: "Entity metrics" }),
    ).toBeVisible();
  },
});

export const TestPeekControls = meta.story({
  name: "(Test) Peek Controls",
  args: {
    variant: "peek",
    headerProps: {
      title: "Trace ID",
      itemType: "TRACE",
      actions: createPeekHeaderActions({
        onClose,
        openInNewTab,
        expand: { isExpanded: false, onToggle },
      }),
    },
    metrics: [],
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Open in new tab" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Expand" }));
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(openInNewTab).toHaveBeenCalledOnce();
    await expect(onToggle).toHaveBeenCalledOnce();
    await expect(onClose).toHaveBeenCalledOnce();
  },
});

export const TestNarrowActions = meta.story({
  name: "(Test) Narrow Action Overflow",
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  args: {
    headerProps: {
      title: "Session ID",
      itemType: "SESSION",
      actions: [
        {
          id: "annotate",
          type: "button",
          label: "Annotate session",
          icon: SquarePen,
          onClick: annotate,
        },
      ],
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.queryByRole("button", { name: "Annotate session" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Annotate session" }),
    );
    await expect(annotate).toHaveBeenCalledOnce();
    await expect(
      body.queryByRole("button", { name: "Annotate session" }),
    ).not.toBeInTheDocument();
  },
});

export const TestWorkflowBeforePeekControls = meta.story({
  name: "(Test) Workflow Before Peek Controls",
  decorators: [
    (Story) => (
      <div className="w-[1200px]">
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "peek",
    headerProps: {
      title: "Trace",
      itemType: "TRACE",
      actions: workflowAndPeekActions,
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas
        .getAllByRole("button")
        .map(
          (button) => button.getAttribute("aria-label") ?? button.textContent,
        ),
    ).toEqual([
      "Add to",
      "Annotate",
      "Comment",
      "Open in new tab",
      "Expand",
      "Close",
    ]);
  },
});

export const TestResponsiveActionStages = meta.story({
  name: "(Test) Labels Then Icons Then Overflow",
  decorators: [
    (Story) => (
      <div data-testid="responsive-header" style={{ width: 1200 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "peek",
    headerProps: {
      title: "Trace",
      itemType: "TRACE",
      actions: workflowAndPeekActions,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const container = canvas.getByTestId("responsive-header");
    const body = within(canvasElement.ownerDocument.body);
    for (const name of ["Add to", "Annotate", "Comment"]) {
      const button = canvas.getByRole("button", { name });
      await expect(button).toHaveTextContent(name);
      await expect(button.getBoundingClientRect().height).toBe(28);
    }
    await expect(
      canvas.getByRole("button", { name: "Close" }).getBoundingClientRect()
        .height,
    ).toBe(28);
    await userEvent.hover(canvas.getByRole("button", { name: "Annotate" }));
    // Wait beyond the tooltip's hover delay to catch redundant labeled tooltips.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(body.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.unhover(canvas.getByRole("button", { name: "Annotate" }));
    container.style.width = "600px";
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Annotate" }),
      ).toHaveTextContent(/^$/),
    );
    await expect(
      canvas.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
    await userEvent.hover(canvas.getByRole("button", { name: "Annotate" }));
    await expect(await body.findByRole("tooltip")).toHaveTextContent(
      "Annotate",
    );
    await userEvent.unhover(canvas.getByRole("button", { name: "Annotate" }));
    container.style.width = "320px";
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "More actions" }),
      ).toBeVisible(),
    );
    await expect(
      canvas.queryByRole("button", { name: "Annotate" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Close" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Annotate" }),
    );
    await expect(annotate).toHaveBeenCalledOnce();
    container.style.width = "1200px";
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Annotate" }),
      ).toHaveTextContent("Annotate"),
    );
  },
});

export const TestNarrowWorkflowBeforePeekControls = meta.story({
  name: "(Test) Narrow Workflow Before Peek Controls",
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "peek",
    headerProps: {
      title: "Trace",
      itemType: "TRACE",
      actions: workflowAndPeekActions,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Expand", "More actions", "Close"]);
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    const addTo = await body.findByRole("button", { name: "Add to" });
    const menu = within(addTo.parentElement!.parentElement!);
    await expect(
      menu.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Add to", "Annotate", "Comment", "Open in new tab"]);
    await userEvent.click(
      menu.getByRole("button", { name: "Open in new tab" }),
    );
    await expect(openInNewTab).toHaveBeenCalledOnce();
    await expect(
      body.queryByRole("button", { name: "Add to" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(onClose).toHaveBeenCalledOnce();
  },
});

export const TestTraceActionsBeforeClose = meta.story({
  name: "(Test) Trace Menu After Peek Controls",
  decorators: [
    (Story) => (
      <div data-testid="trace-header" style={{ width: 1200 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    variant: "peek",
    headerProps: {
      title: "Trace",
      itemType: "TRACE",
      actions: [
        workflowAndPeekActions[0],
        {
          id: "download-json",
          type: "button",
          label: "Download JSON",
          icon: Download,
          iconOnly: true,
          onClick: fn(),
        },
        {
          id: "trace-options",
          type: "dropdown",
          label: "More actions",
          icon: MoreVertical,
          iconOnly: true,
          placement: "trailing",
          items: [
            {
              id: "copy-trace-id",
              type: "item",
              title: "Copy trace ID",
              onClick: copyTraceId,
            },
          ],
        },
        {
          id: "previous",
          type: "button",
          label: "Previous",
          icon: ArrowUp,
          iconOnly: true,
          pinned: true,
          onClick: fn(),
        },
        {
          id: "next",
          type: "button",
          label: "Next",
          icon: ArrowDown,
          iconOnly: true,
          pinned: true,
          onClick: fn(),
        },
        ...createPeekHeaderActions({ onClose, openInNewTab }),
      ],
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Add to",
      "Download JSON",
      "Open in new tab",
      "Previous",
      "Next",
      "More actions",
      "Close",
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Copy trace ID" }),
    );
    await expect(copyTraceId).toHaveBeenCalledOnce();
    canvas.getByTestId("trace-header").style.width = "320px";
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Download JSON" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      canvas
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Previous", "Next", "More actions", "Close"]);
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Copy trace ID" }),
    );
    await expect(copyTraceId).toHaveBeenCalledTimes(2);
    await expect(
      body.queryByRole("button", { name: "Copy trace ID" }),
    ).not.toBeInTheDocument();
  },
});

export const TestWithoutMetrics = meta.story({
  name: "(Test) Loading Without Metrics",
  args: {
    variant: "peek",
    headerProps: {
      title: "Loading trace",
      itemType: "TRACE",
      actions: createPeekHeaderActions({ onClose }),
    },
    metrics: [],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading trace")).toBeVisible();
    await expect(
      canvas.queryByRole("group", { name: "Entity metrics" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(onClose).toHaveBeenCalledOnce();
  },
});

export const TestScopeSwitch = meta.story({
  name: "(Test) Scope Switch In Title Row",
  args: {
    headerProps: {
      title: "Trace ID",
      titleTabs: {
        label: "Scope",
        value: "trace",
        options: [
          { value: "trace", label: "Trace", itemType: "TRACE" },
          { value: "session", label: "Session", itemType: "SESSION" },
        ],
        onValueChange,
      },
    },
    metrics: [],
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("tab", { name: "Session" }));
    await expect(onValueChange).toHaveBeenCalledWith("session");
  },
});

export const TestPlaceholderMetrics = meta.story({
  name: "(Test) Placeholder Metrics Keep Controls Enabled",
  args: {
    variant: "peek",
    headerProps: {
      title: "Next trace",
      itemType: "TRACE",
      actions: createPeekHeaderActions({ onClose }),
    },
    isPlaceholderData: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("group", { name: "Entity metrics" }),
    ).toHaveAttribute("inert");
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(onClose).toHaveBeenCalledOnce();
  },
});
