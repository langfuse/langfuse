/* eslint-disable @repo/no-style-props */
import type React from "react";
import { Badge } from "@/src/components/ui/badge";
import {
  CircleDot,
  ClipboardPen,
  Database,
  Fan,
  ListTree,
  MoveHorizontal,
  User,
  FileText,
  FlaskConical,
  ListTodo,
  WandSparkles,
  TestTubeDiagonal,
  Clock,
  Bot,
  Wrench,
  Link,
  Search,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { cva } from "class-variance-authority";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type ObservationType } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

export type LangfuseItemType =
  | ObservationType
  | "TRACE"
  | "SESSION"
  | "USER"
  | "QUEUE_ITEM"
  | "DATASET"
  | "DATASET_RUN"
  | "DATASET_ITEM"
  | "ANNOTATION_QUEUE"
  | "PROMPT"
  | "EVALUATOR"
  | "RUNNING_EVALUATOR"
  | "EXPERIMENT";

const iconMap = {
  TRACE: ListTree,
  GENERATION: Fan,
  EVENT: CircleDot,
  SPAN: MoveHorizontal,
  AGENT: Bot,
  TOOL: Wrench,
  CHAIN: Link,
  RETRIEVER: Search,
  EMBEDDING: Layers3,
  GUARDRAIL: ShieldCheck,
  SESSION: Clock,
  USER: User,
  QUEUE_ITEM: ClipboardPen,
  DATASET: Database,
  DATASET_RUN: FlaskConical,
  DATASET_ITEM: TestTubeDiagonal,
  ANNOTATION_QUEUE: ListTodo,
  PROMPT: FileText,
  RUNNING_EVALUATOR: Bot,
  EVALUATOR: WandSparkles,
  EXPERIMENT: FlaskConical,
} as const;

const iconVariants = cva("shrink-0", {
  variants: {
    type: {
      TRACE: "text-observation-trace-line",
      GENERATION: "text-observation-generation-line",
      EVENT: "text-observation-event-line",
      SPAN: "text-observation-span-line",
      AGENT: "text-observation-agent-line",
      TOOL: "text-observation-tool-line",
      CHAIN: "text-observation-chain-line",
      RETRIEVER: "text-observation-retriever-line",
      EMBEDDING: "text-observation-embedding-line",
      GUARDRAIL: "text-observation-guardrail-line",
      SESSION: "text-primary-accent",
      USER: "text-primary-accent",
      QUEUE_ITEM: "text-primary-accent",
      DATASET: "text-primary-accent",
      DATASET_RUN: "text-primary-accent",
      DATASET_ITEM: "text-primary-accent",
      ANNOTATION_QUEUE: "text-primary-accent",
      PROMPT: "text-primary-accent",
      EVALUATOR: "text-observation-evaluator-line",
      RUNNING_EVALUATOR: "text-primary-accent",
      EXPERIMENT: "text-primary-accent",
    },
  },
});

/** The type icon alone, no badge chrome. */
export function ItemTypeIcon({
  type,
  className,
}: {
  type: LangfuseItemType;
  className?: string;
}) {
  const Icon = iconMap[type];
  return (
    <Icon className={cn("icon-base", iconVariants({ type }), className)} />
  );
}

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
      SESSION: "bg-primary-accent",
      USER: "bg-primary-accent",
      QUEUE_ITEM: "bg-primary-accent",
      DATASET: "bg-primary-accent",
      DATASET_RUN: "bg-primary-accent",
      DATASET_ITEM: "bg-primary-accent",
      ANNOTATION_QUEUE: "bg-primary-accent",
      PROMPT: "bg-primary-accent",
      EVALUATOR: "bg-observation-evaluator-fill",
      RUNNING_EVALUATOR: "bg-primary-accent",
      EXPERIMENT: "bg-primary-accent",
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
  const Icon = iconMap[type] || ListTree;
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
          <Icon className="icon-base text-white" />
        </span>
      )}
    </Tooltip>
  );
}

export function renderFilterIcon(value: string): React.ReactNode {
  const type = value as LangfuseItemType;
  const Icon = iconMap[type];
  if (!Icon) return null;
  return <Icon className={cn("icon-base", iconVariants({ type }))} />;
}

/**
 * `"DATASET_RUN"` -> `{ label: "Dataset_run", displayLabel: "Dataset run" }`.
 * `label` titles the element, `displayLabel` is what the user reads.
 */
export function getItemTypeLabels(type: LangfuseItemType) {
  const label =
    String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();
  return { label, displayLabel: label.replace(/_/g, " ") };
}

export function ItemBadge({
  type,
  showLabel = false,
  isSmall = false,
  className,
}: {
  type: LangfuseItemType;
  showLabel?: boolean;
  isSmall?: boolean;
  className?: string;
}) {
  const Icon = iconMap[type] || ListTree;

  const iconClass = cn(
    isSmall ? "icon-sm" : "icon-base",
    iconVariants({ type }),
    className,
  );

  const { label, displayLabel } = getItemTypeLabels(type);

  return (
    <Badge
      variant="outline"
      title={label}
      className={cn(
        "flex max-w-fit items-center gap-1 overflow-hidden whitespace-nowrap",
        // Icon-only: square box, `max-w-none` so the width is not capped at the icon.
        showLabel
          ? "px-1"
          : cn(
              "max-w-none justify-center border-transparent p-0",
              isSmall ? "size-4" : "size-6",
            ),
        isSmall && showLabel && "h-4",
      )}
    >
      {!showLabel && <Icon className={iconClass} />}
      {showLabel && (
        <span className="truncate" title={displayLabel}>
          {displayLabel}
        </span>
      )}
    </Badge>
  );
}
