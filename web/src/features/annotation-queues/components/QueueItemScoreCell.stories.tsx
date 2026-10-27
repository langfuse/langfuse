import preview from "../../../../.storybook/preview";
import { type QueueItemScore } from "@/src/features/annotation-queues/lib/queueItemScores";
import { QueueItemScoreCell } from "./QueueItemScoreCell";

const annotationScore = (
  overrides: Partial<QueueItemScore>,
): QueueItemScore => ({
  id: "score-1",
  name: "risk",
  source: "ANNOTATION",
  configId: "risk",
  dataType: "CATEGORICAL",
  value: 0,
  stringValue: null,
  timestamp: new Date("2026-10-01T09:30:00Z"),
  ...overrides,
});

const categoricalConfig = (labels: string[]) => ({
  id: "risk",
  name: "risk",
  categories: labels.map((label, value) => ({ label, value })),
});

const meta = preview.meta({
  component: QueueItemScoreCell,
});

export const Categorical = meta.story({
  args: {
    config: categoricalConfig(["high", "medium", "low"]),
    scores: [annotationScore({ stringValue: "medium", value: 1 })],
  },
});

export const Numeric = meta.story({
  args: {
    config: { id: "duration", name: "duration", categories: null },
    scores: [
      annotationScore({
        configId: "duration",
        name: "duration",
        dataType: "NUMERIC",
        value: 42.125,
      }),
    ],
  },
});

export const WithLongText = meta.story({
  args: {
    config: { id: "notes", name: "notes", categories: null },
    scores: [
      annotationScore({
        configId: "notes",
        name: "notes",
        dataType: "TEXT",
        stringValue:
          "Caller asked twice about the booking date and the agent transferred them before confirming the address.",
      }),
    ],
  },
  render: (args) => (
    <div className="w-48">
      <QueueItemScoreCell {...args} />
    </div>
  ),
});

export const Empty = meta.story({
  args: {
    config: categoricalConfig(["pass", "fail"]),
    scores: [],
    emptyValue: "–",
  },
});

const matrixRows: { title: string; labels: string[] }[] = [
  { title: "Overrides", labels: ["high", "medium", "low", "pass", "fail"] },
  {
    title: "Outcome overrides",
    labels: ["booked", "answered", "transferred", "not_booked", "not_answered"],
  },
  {
    title: "Palette by category index",
    labels: [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "epsilon",
      "zeta",
      "eta",
      "theta",
      "iota",
      "kappa",
    ],
  },
];

export const VariantMatrix = meta.story({
  args: { config: categoricalConfig([]), scores: [] },
  render: () => (
    <div className="flex flex-col gap-3">
      {matrixRows.map(({ title, labels }) => (
        <div key={title} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{title}</span>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <QueueItemScoreCell
                key={label}
                config={categoricalConfig(labels)}
                scores={[annotationScore({ stringValue: label })]}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
});

export const PendingFromApi = meta.story({
  args: {
    config: categoricalConfig(["high", "medium", "low"]),
    scores: [annotationScore({ source: "API", stringValue: "high", value: 0 })],
  },
});
