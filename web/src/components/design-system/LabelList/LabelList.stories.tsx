import preview from "../../../../.storybook/preview";
import { LabelList } from "./LabelList";

const meta = preview.meta({
  component: LabelList,
});

const manyLabels = [
  "staging",
  "latest",
  "canary",
  "production",
  "experiment-a",
  "experiment-b",
  "qa",
];

export const Default = meta.story({
  args: {
    labels: ["staging", "latest", "production"],
  },
});

export const WithOverflow = meta.story({
  args: {
    labels: manyLabels,
    maxVisible: 3,
  },
});

export const SingleLine = meta.story({
  args: {
    labels: manyLabels,
    maxVisible: 2,
    shouldWrap: false,
  },
});

export const Inline = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs">Version 4</span>
      <LabelList labels={["production", "latest", "staging"]} layout="inline" />
      <span className="text-muted-foreground text-xs">by jane</span>
    </div>
  ),
});
