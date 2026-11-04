import { type ComponentProps } from "react";
import { fn } from "storybook/test";
import preview from "../../../.storybook/preview";
import { TopicGridView } from "./TopicGridView";

const topics = [
  { id: "billing", name: "Billing questions", description: "", count: 0 },
  { id: "login", name: "Login and access problems", description: "", count: 0 },
  { id: "export", name: "Data export requests", description: "", count: 0 },
  {
    id: "pricing",
    name: "Pricing and plan changes",
    description: "",
    count: 0,
  },
  {
    id: "bugs",
    name: "Unexpected errors in the editor",
    description: "",
    count: 0,
  },
  { id: "howto", name: "How-to and onboarding", description: "", count: 0 },
].map((topic) => ({ ...topic, versionId: `${topic.id}-v1`, runId: "run" }));
const clusters: { topic: number | null; x: number; y: number; n: number }[] = [
  { topic: 0, x: -6, y: -4, n: 70 },
  { topic: 1, x: 5, y: -5, n: 55 },
  { topic: 2, x: 6, y: 4, n: 40 },
  { topic: 3, x: -5, y: 5, n: 60 },
  { topic: 4, x: 0, y: 0, n: 35 },
  { topic: 5, x: 1, y: 7, n: 45 },
  { topic: null, x: 0, y: -1, n: 30 },
];

const random = mulberry32(7);
const points = clusters.flatMap((cluster, clusterIndex) =>
  Array.from({ length: cluster.n }, (_, index) => {
    const spread = cluster.topic === null ? 6 : 1.4;
    const topic = cluster.topic === null ? null : topics[cluster.topic];
    return {
      traceId: `trace-${clusterIndex}-${index}-${random().toString(36).slice(2, 10)}`,
      summary: topic
        ? `${topic.name}: user asked about case ${index + 1} and expected a quicker resolution than they got.`
        : `Unrelated request ${index + 1} that did not fit any topic.`,
      topicId: topic?.id ?? null,
      outcome: topic ? ("assigned" as const) : ("outlier" as const),
      x: cluster.x + gaussian(random) * spread,
      y: cluster.y + gaussian(random) * spread,
    };
  }),
);
const rows = points.map((point, index) => ({
  traceId: point.traceId,
  summary: point.summary,
  topicId: point.topicId,
  topicName: topics.find((topic) => topic.id === point.topicId)?.name ?? null,
  outcome: point.outcome,
  facetVersion: 1,
  unitStartTime: new Date(Date.now() - index * 7 * 60_000).toISOString(),
}));
const facet = {
  facetId: "intent",
  name: "Intent",
  facetVersion: 1,
  rows,
  topics: topics.map((topic) => ({
    ...topic,
    count: rows.filter((row) => row.topicId === topic.id).length,
  })),
  map: { runId: "run", topics },
  awaitingCount: 0,
  usableCount: rows.length,
};
const mapData = {
  status: "ready" as const,
  reason: null,
  points,
  missingSummaryCount: 0,
  unpositionedCount: 0,
};

const defaultArgs: ComponentProps<typeof TopicGridView> = {
  projectId: "storybook-topics",
  facet,
  mapResult: { data: mapData, error: null },
  onOpenTrace: fn(),
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
  component: TopicGridView,
  args: defaultArgs,
  render: (args) => (
    <div className="flex h-[800px] flex-col">
      <TopicGridView {...args} />
    </div>
  ),
});

export const Default = meta.story({});

/** Seeded linear congruential generator so the story renders the same grid every time. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function gaussian(next: () => number) {
  const u = 1 - next();
  const v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
