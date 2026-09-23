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

const iconVariants = cva("h-4 w-4", {
  variants: {
    type: {
      TRACE: "text-observation-trace",
      GENERATION: "text-observation-generation",
      EVENT: "text-observation-event",
      SPAN: "text-observation-span",
      AGENT: "text-observation-agent",
      TOOL: "text-observation-tool",
      CHAIN: "text-observation-chain",
      RETRIEVER: "text-observation-retriever",
      EMBEDDING: "text-observation-embedding",
      GUARDRAIL: "text-observation-guardrail",
      SESSION: "text-primary-accent",
      USER: "text-primary-accent",
      QUEUE_ITEM: "text-primary-accent",
      DATASET: "text-primary-accent",
      DATASET_RUN: "text-primary-accent",
      DATASET_ITEM: "text-primary-accent",
      ANNOTATION_QUEUE: "text-primary-accent",
      PROMPT: "text-primary-accent",
      EVALUATOR: "text-observation-evaluator",
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
  return <Icon className={cn("shrink-0", iconVariants({ type }), className)} />;
}

export function renderFilterIcon(value: string): React.ReactNode {
  const type = value as LangfuseItemType;
  const Icon = iconMap[type];
  if (!Icon) return null;
  return (
    <Icon className={cn("h-3.5 w-3.5 shrink-0", iconVariants({ type }))} />
  );
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
  const Icon = iconMap[type] || ListTree; // Default to ListTree if unknown type

  // Modify this line to ensure the icon is properly sized
  const iconClass = cn(
    "shrink-0",
    iconVariants({ type }),
    isSmall ? "h-3 w-3" : "h-4 w-4",
    className,
  );

  const { label, displayLabel } = getItemTypeLabels(type);

  return (
    <Badge
      variant="outline"
      title={label}
      className={cn(
        "bg-background flex max-w-fit items-center gap-1 overflow-hidden border-2 whitespace-nowrap",
        // With a label the horizontal padding is what separates the icon from the
        // text. Without one there is nothing to separate, and the padding only
        // made a square icon sit in a rectangle. `max-w-none` is what lets it be
        // square: `max-w-fit` caps the width at the icon's own width, so a set
        // size would apply to the height alone.
        showLabel
          ? "px-1"
          : cn("max-w-none justify-center p-0", isSmall ? "size-4" : "size-6"),
        isSmall && showLabel && "h-4",
      )}
    >
      <Icon className={iconClass} />
      {showLabel && (
        <span className="truncate" title={displayLabel}>
          {displayLabel}
        </span>
      )}
    </Badge>
  );
}
