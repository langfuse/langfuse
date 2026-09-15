import preview from "../../.storybook/preview";
import { type LangfuseItemType } from "./ItemBadge";
import { ItemTypeChip } from "./ItemTypeChip";

const meta = preview.meta({
  component: ItemTypeChip,
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
  args: { type: "TRACE" },
});

export const VariantMatrix = meta.story({
  args: { type: "TRACE" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {TYPES.map((type) => (
        <ItemTypeChip key={type} type={type} />
      ))}
    </div>
  ),
});
