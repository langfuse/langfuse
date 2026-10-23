import { type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
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
const topics = names.map((name, index) => ({
  id: `topic-${index}`,
  name,
  description: "",
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

const manyTopics = Array.from({ length: 40 }, (_, index) => ({
  id: `many-${index}`,
  name: `Cluster ${index + 1}: ${["refund status", "order tracking", "address change", "login help", "invoice copy"][index % 5]}`,
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
