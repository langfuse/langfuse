import preview from "../../../../.storybook/preview";
import { LabelList } from "./LabelList";

const meta = preview.meta({
  component: LabelList,
});

const manyLabels = [
  { name: "production", isProduction: true },
  { name: "latest" },
  { name: "canary" },
  { name: "experiment-a" },
  { name: "experiment-b" },
  { name: "qa" },
  { name: "staging" },
];

const fewLabels = manyLabels.slice(0, 3);

export const Default = meta.story({
  args: {
    labels: fewLabels,
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
    shouldWrap: false,
  },
  render: (args) => (
    <div className="w-60 resize-x overflow-hidden">
      <LabelList {...args} />
    </div>
  ),
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
      <LabelList labels={fewLabels} layout="inline" />
      <span className="text-muted-foreground text-xs">by jane</span>
    </div>
  ),
});
