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
      TRACE: "text-obs-trace",
      GENERATION: "text-obs-generation",
      EVENT: "text-obs-event",
      SPAN: "text-obs-span",
      AGENT: "text-obs-agent",
      TOOL: "text-obs-tool",
      CHAIN: "text-obs-chain",
      RETRIEVER: "text-obs-retriever",
      EMBEDDING: "text-obs-embedding",
      GUARDRAIL: "text-obs-guardrail",
      SESSION: "text-obs-entity",
      USER: "text-obs-entity",
      QUEUE_ITEM: "text-obs-entity",
      DATASET: "text-obs-entity",
      DATASET_RUN: "text-obs-entity",
      DATASET_ITEM: "text-obs-entity",
      ANNOTATION_QUEUE: "text-obs-entity",
      PROMPT: "text-obs-entity",
      EVALUATOR: "text-obs-entity",
      RUNNING_EVALUATOR: "text-obs-entity",
      EXPERIMENT: "text-obs-entity",
    },
  },
});

export function renderFilterIcon(value: string): React.ReactNode {
  const type = value as LangfuseItemType;
  const Icon = iconMap[type];
  if (!Icon) return null;
  return (
    <Icon className={cn("h-3.5 w-3.5 shrink-0", iconVariants({ type }))} />
  );
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

  const label =
    String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();

  const displayLabel = label.replace(/_/g, " ");

  return (
    <Badge
      variant="outline"
      title={label}
      className={cn(
        "bg-canvas flex max-w-fit items-center gap-1 overflow-hidden border-2 px-1 whitespace-nowrap",
        isSmall && "h-4",
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
