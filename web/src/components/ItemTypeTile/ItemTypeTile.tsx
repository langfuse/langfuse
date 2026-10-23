/* eslint-disable @repo/no-style-props */
import { ItemTypeIcon } from "../ItemTypeIcon/ItemTypeIcon";
import { cva } from "class-variance-authority";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { cn } from "@/src/utils/tailwind";
import { type LangfuseItemType } from "@/src/utils/itemType";
import { getItemTypeLabels } from "../ItemBadge/fns/getItemTypeLabels";

const tileVariants = cva("", {
  variants: {
    type: {
      TRACE: "bg-observation-trace-fill",
      GENERATION: "bg-observation-generation-fill",
      EVENT: "bg-observation-event-fill",
      SPAN: "bg-observation-span-fill",
      AGENT: "bg-observation-agent-fill",
      TOOL: "bg-observation-tool-fill",
      CHAIN: "bg-observation-chain-fill",
      RETRIEVER: "bg-observation-retriever-fill",
      EMBEDDING: "bg-observation-embedding-fill",
      GUARDRAIL: "bg-observation-guardrail-fill",
      SESSION: "bg-primary-accent-fill",
      USER: "bg-primary-accent-fill",
      QUEUE_ITEM: "bg-primary-accent-fill",
      DATASET: "bg-primary-accent-fill",
      DATASET_RUN: "bg-primary-accent-fill",
      DATASET_ITEM: "bg-primary-accent-fill",
      ANNOTATION_QUEUE: "bg-primary-accent-fill",
      PROMPT: "bg-primary-accent-fill",
      EVALUATOR: "bg-observation-evaluator-fill",
      RUNNING_EVALUATOR: "bg-primary-accent-fill",
      EXPERIMENT: "bg-primary-accent-fill",
    },
  },
});

/** The type icon on a filled square in the type's colour; anchors headers. */
export function ItemTypeTile({
  type,
  className,
}: {
  type: LangfuseItemType;
  className?: string;
}) {
  const { displayLabel } = getItemTypeLabels(type);
  return (
    <Tooltip label={displayLabel}>
      {({ getTriggerProps }) => (
        <span
          role="img"
          aria-label={displayLabel}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-sm",
            tileVariants({ type }),
            className,
          )}
          {...getTriggerProps()}
        >
          <ItemTypeIcon type={type} size="base" color="white" />
        </span>
      )}
    </Tooltip>
  );
}
