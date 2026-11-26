import { PINCH_ZOOM_RATE } from "@/src/utils/panZoomGestures";
import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicTreemapView } from "./TopicTreemapView";
import {
  staticTopicTraces,
  storyFacet,
} from "@/.storybook/fixtures/topic-story-traces";

const counts = [55, 45, 27, 23, 21, 20, 20, 18, 17, 16, 15, 15, 14, 14, 13];
const names = [
  "Langfuse user assistance",
  "Dashboard widget management",
  "Trace analysis title requests",
  "Trace and observation filtering",
  "Trace cost analysis",
  "Conversation title generation",
  "Human evaluation workflow",
  "LLM-as-a-judge evaluator setup",
  "Failure analysis and prioritization",
  "Langfuse session and trace review",
  "Weekly cost comparisons",
  "Failed trace error analysis",
  "Trace performance review",
  "Langfuse trace export",
  "Recommendation requests",
];
const LONG_DESCRIPTION =
  "Users asked the in-app assistant how to instrument their application, read traces and observations, configure evaluations and datasets, and interpret dashboard metrics. Many follow-ups asked for step-by-step guidance tailored to a specific SDK, framework, or self-hosted deployment, and several conversations combined product questions with troubleshooting of missing or delayed traces.";
const topics = names.map((name, index) => ({
  id: `topic-${index}`,
  versionId: `topic-${index}-v1`,
  runId: "run",
  name,
  description: index === 0 ? LONG_DESCRIPTION : "",
  count: counts[index],
}));
const assignedRows = topics.flatMap((topic) =>
  Array.from({ length: topic.count }, (_, index) => ({
    traceId: `${topic.id}-trace-${index}`,
    summary: `${topic.name} question ${index + 1}`,
    topicId: topic.id,
    topicName: topic.name,
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: new Date(Date.now() - index * 7 * 60_000).toISOString(),
  })),
);

const rows = [
  ...assignedRows,
  ...Array.from({ length: 12 }, (_, index) => ({
    traceId: `unassigned-trace-${index}`,
    summary: `Unrelated request ${index + 1} that fit no topic`,
    topicId: null,
    topicName: null,
    outcome: "outlier" as const,
    facetVersion: 1,
    unitStartTime: new Date(Date.now() - index * 11 * 60_000).toISOString(),
  })),
];

const facet = storyFacet(
  { facetId: "intent", name: "Intent", facetVersion: 1, topics, map: null },
  rows,
);

const defaultArgs: ComponentProps<typeof TopicTreemapView> = {
  projectId: "storybook-topics",
  facet,
  useTraces: staticTopicTraces(rows),
  peekView: {
    itemType: "TRACE",
    tableName: "topics-topic-traces",
    isV4: false,
    closePeek: fn(),
  },
};

const meta = preview.meta({
  component: TopicTreemapView,
  args: defaultArgs,
  render: (args) => (
    <div className="flex h-screen flex-col p-2">
      <TopicTreemapView {...args} />
    </div>
  ),
});

export const Default = meta.story({});

/** Treemap on the left, traces on the right. */
export const SideBySide = meta.story({ args: { sideBySide: true } });

const manyUnassignedRows = [
  ...assignedRows,
  ...Array.from({ length: 320 }, (_, index) => ({
    traceId: `unassigned-trace-${index}`,
    summary: `Unrelated request ${index + 1} that fit no topic`,
    topicId: null,
    topicName: null,
    outcome: "outlier" as const,
    facetVersion: 1,
    unitStartTime: new Date(Date.now() - index * 3 * 60_000).toISOString(),
  })),
];

const MANY_TOPIC_NAMES = [
  "Refund status",
  "Order tracking",
  "Change shipping address",
  "Login help",
  "Invoice copy",
  "Cancel subscription",
  "Update payment method",
  "Missing items",
  "Damaged delivery",
  "Return label request",
  "Promo code not applied",
  "Delivery date change",
  "Reset password",
  "Two-factor setup",
  "Account deletion",
  "Plan upgrade",
  "Billing cycle question",
  "Gift card balance",
  "Store opening hours",
  "Product availability",
  "Size exchange",
  "Warranty claim",
  "Price match request",
  "Loyalty points",
  "Order cancellation",
  "Duplicate charge",
  "Tax invoice",
  "Bulk order quote",
  "Pickup location",
  "Driver contact",
  "Late delivery",
  "Wrong item sent",
  "Email preferences",
  "Language settings",
  "API key question",
  "Data export",
  "Accessibility request",
  "Feedback on app",
  "Partnership inquiry",
  "Job application",
];
const manyTopics = Array.from({ length: 40 }, (_, index) => ({
  id: `many-${index}`,
  versionId: `many-${index}-v1`,
  runId: "run",
  name: MANY_TOPIC_NAMES[index],
  description: "",
  count: Math.max(2, Math.round(120 / (index + 1))),
}));
const manyRows = manyTopics.flatMap((topic) =>
  Array.from({ length: topic.count }, (_, index) => ({
    traceId: `${topic.id}-trace-${index}`,
    summary: `${topic.name} request ${index + 1}`,
    topicId: topic.id,
    topicName: topic.name,
    outcome: "assigned" as const,
    facetVersion: 1,
    unitStartTime: new Date(Date.now() - index * 4 * 60_000).toISOString(),
  })),
);

/** Forty clusters: small tiles drop the count, then the name, keeping both in the tooltip. */
const manyTopic = { ...topics[0], count: 350 };
const bigTopicRows = Array.from({ length: manyTopic.count }, (_, index) => ({
  ...assignedRows[0],
  traceId: `${manyTopic.id}-many-${index}`,
  summary: `${manyTopic.name} question ${index + 1}`,
}));

/** One topic with 350 traces; its list adds 100 rows each time you scroll near the end. */
export const ManyTraces = meta.story({
  args: {
    sideBySide: true,
    facet: {
      ...facet,
      rows: [
        ...bigTopicRows,
        ...rows.filter((row) => row.topicId !== manyTopic.id),
      ],
      topics: [manyTopic, ...topics.slice(1)],
      usableCount: bigTopicRows.length + rows.length - topics[0].count,
    },
  },
});

export const ManyClusters = meta.story({
  args: {
    facet: {
      ...facet,
      topics: manyTopics,
      rows: manyRows,
      usableCount: manyRows.length,
    },
  },
});

/** About half of the traces fit no topic; Unassigned stays at ~10% of the area. */
export const LargeUnassigned = meta.story({
  args: {
    facet: {
      ...facet,
      rows: manyUnassignedRows,
      usableCount: manyUnassignedRows.length,
    },
  },
});

const issueTopics = [
  { name: "Incomplete runs with undelivered results", count: 40 },
  { name: "Research halted before handback report", count: 35 },
  { name: "Unfinished work with unverified checks", count: 35 },
  { name: "Run stopped before delivering final report", count: 18 },
  { name: "Run halted before delivering requested report", count: 18 },
  { name: "Partial answers without follow-up", count: 16 },
].map((topic, index) => ({
  ...topic,
  id: `issue-${index}`,
  versionId: `issue-${index}-v1`,
  runId: "run",
  description: "",
}));

export const LongNamesOnShortTiles = meta.story({
  name: "Long names on short tiles",
  args: {
    facet: {
      ...facet,
      facetId: "issues",
      name: "Issues",
      topics: issueTopics,
      rows: [
        ...issueTopics.flatMap((topic) =>
          Array.from({ length: topic.count }, (_, index) => ({
            ...assignedRows[0],
            traceId: `${topic.id}-trace-${index}`,
            summary: `${topic.name} ${index + 1}`,
            topicId: topic.id,
            topicName: topic.name,
          })),
        ),
        ...Array.from({ length: 261 }, (_, index) => ({
          ...rows[rows.length - 1],
          traceId: `issues-unassigned-${index}`,
        })),
      ],
    },
  },
  render: (args) => (
    <div className="flex flex-col" style={{ width: 1736, height: 1000 }}>
      <TopicTreemapView {...args} />
    </div>
  ),
});

export const SelectTopic = meta.story({
  name: "(Test) Selecting a tile lists its traces, selecting it again lists all",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = await canvas.findByRole("button", {
      name: "Trace cost analysis, 21 traces",
    });
    // The list remounts per selection, so it is looked up again each time.
    const traceList = () =>
      within(canvas.getByRole("region", { name: "Topic traces" }));
    await expect(
      traceList().getByRole("heading", { name: "All traces" }),
    ).toBeVisible();
    await userEvent.click(tile);
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(
      await traceList().findByRole("heading", { name: /Trace cost analysis/ }),
    ).toBeVisible();
    await userEvent.click(tile);
    await expect(tile).toHaveAttribute("aria-pressed", "false");
    await expect(
      await traceList().findByRole("heading", { name: "All traces" }),
    ).toBeVisible();
  },
});

export const ZoomTreemap = meta.story({
  name: "(Test) Control scroll zooms tiles and reset restores them",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = await canvas.findByRole("button", {
      name: "Trace cost analysis, 21 traces",
    });
    const area = () => {
      const rect = tile.getBoundingClientRect();
      return rect.width * rect.height;
    };
    const before = area();
    await expect(
      canvas.queryByRole("button", { name: "Reset zoom" }),
    ).not.toBeInTheDocument();
    const start = tile.getBoundingClientRect();
    const at = {
      clientX: start.left + start.width / 2,
      clientY: start.top + start.height / 2,
    };
    tile.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -1 / PINCH_ZOOM_RATE,
        ...at,
      }),
    );
    // One zoom level doubles the treemap height, so every tile gets about twice the area.
    await waitFor(() => expect(area() / before).toBeGreaterThan(1.8));
    // The layout reflows, but the tile under the cursor stays in view.
    const zoomed = tile.getBoundingClientRect();
    const visible = canvas
      .getByRole("region", { name: "Topics" })
      .parentElement!.getBoundingClientRect();
    await expect(zoomed.bottom).toBeGreaterThan(visible.top);
    await expect(zoomed.top).toBeLessThan(visible.bottom);
    await userEvent.click(canvas.getByRole("button", { name: "Reset zoom" }));
    await waitFor(() => expect(area()).toBeCloseTo(before, 0));
    await expect(
      canvas.queryByRole("button", { name: "Reset zoom" }),
    ).not.toBeInTheDocument();
  },
});

export const DescriptionTooltipWhenClipped = meta.story({
  name: "(Test) Hover shows the full text only when clipped",
  render: (args) => (
    <div className="flex flex-col" style={{ width: 720, height: 900 }}>
      <TopicTreemapView {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // No tile is picked at first, so pick the topic with the long description.
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Langfuse user assistance, 55 traces",
      }),
    );
    const list = within(canvas.getByRole("region", { name: "Topic traces" }));
    const title = await list.findByRole("heading", {
      name: "Langfuse user assistance",
    });
    const description = list.getByText(LONG_DESCRIPTION);
    // The title lives on the name span, not the heading.
    const name = within(title).getByText("Langfuse user assistance");
    await userEvent.hover(name);
    await userEvent.hover(description);
    await waitFor(() =>
      expect(description).toHaveAttribute("title", LONG_DESCRIPTION),
    );
    await expect(name).not.toHaveAttribute("title");
  },
});
