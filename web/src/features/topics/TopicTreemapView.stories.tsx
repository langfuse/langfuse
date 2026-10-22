import { type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicTreemapView } from "./TopicTreemapView";

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
  name,
  description:
    index === 0 ? LONG_DESCRIPTION : `Requests about ${name.toLowerCase()}.`,
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

const facet: ComponentProps<typeof TopicTreemapView>["facet"] = {
  facetId: "intent",
  name: "Intent",
  facetVersion: 1,
  rows,
  topics,
  map: null,
  awaitingCount: 0,
  usableCount: rows.length,
};

const defaultArgs: ComponentProps<typeof TopicTreemapView> = {
  projectId: "storybook-topics",
  facet,
  onGenerateTopics: fn(),
  canGenerateTopics: true,
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

const issueTopics = [
  { name: "Incomplete runs with undelivered results", count: 40 },
  { name: "Research halted before handback report", count: 35 },
  { name: "Unfinished work with unverified checks", count: 35 },
  { name: "Run stopped before delivering final report", count: 18 },
  { name: "Run halted before delivering requested report", count: 18 },
  { name: "Partial answers without follow-up", count: 16 },
].map((topic, index) => ({ ...topic, id: `issue-${index}`, description: "" }));

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
  name: "(Test) Selecting a tile lists its traces",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tile = await canvas.findByRole("button", {
      name: "Trace cost analysis, 21 traces",
    });
    await userEvent.click(tile);
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    const list = canvas.getByRole("region", { name: "Topic traces" });
    await expect(
      within(list).getByRole("heading", { name: /Trace cost analysis/ }),
    ).toBeVisible();
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
    const clipped = within(
      canvas.getByRole("region", { name: "Topic traces" }),
    ).getByText(LONG_DESCRIPTION);
    await userEvent.hover(clipped);
    await waitFor(() =>
      expect(clipped).toHaveAttribute("title", LONG_DESCRIPTION),
    );

    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Trace cost analysis, 21 traces",
      }),
    );
    const list = within(canvas.getByRole("region", { name: "Topic traces" }));
    const fitting = list.getByText("Requests about trace cost analysis.");
    const title = list.getByText("Trace cost analysis");
    await userEvent.hover(fitting);
    await userEvent.hover(title);
    await expect(fitting).not.toHaveAttribute("title");
    await expect(title).not.toHaveAttribute("title");
  },
});
