import preview from "../../.storybook/preview";
import { getItemTypeLabels, type LangfuseItemType } from "./ItemBadge";
import { TextChip } from "./TextChip";

const meta = preview.meta({
  component: TextChip,
});

const TYPES: LangfuseItemType[] = [
  "TRACE",
  "SPAN",
  "GENERATION",
  "EVENT",
  "AGENT",
  "TOOL",
  "CHAIN",
  "RETRIEVER",
  "EMBEDDING",
  "GUARDRAIL",
  "SESSION",
  "USER",
  "QUEUE_ITEM",
  "DATASET",
  "DATASET_RUN",
  "DATASET_ITEM",
  "ANNOTATION_QUEUE",
  "PROMPT",
  "EVALUATOR",
  "RUNNING_EVALUATOR",
  "EXPERIMENT",
];

export const Default = meta.story({
  args: { text: "Trace" },
});

export const VariantMatrix = meta.story({
  args: { text: "Trace" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {TYPES.map((type) => {
        const { displayLabel } = getItemTypeLabels(type);
        return <TextChip key={type} text={displayLabel} />;
      })}
    </div>
  ),
});
