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
      TRACE: "icon-obs-trace",
      GENERATION: "icon-obs-generation",
      EVENT: "icon-obs-event",
      SPAN: "icon-obs-span",
      AGENT: "icon-obs-agent",
      TOOL: "icon-obs-tool",
      CHAIN: "icon-obs-chain",
      RETRIEVER: "icon-obs-retriever",
      EMBEDDING: "icon-obs-embedding",
      GUARDRAIL: "icon-obs-guardrail",
      SESSION: "icon-obs-entity",
      USER: "icon-obs-entity",
      QUEUE_ITEM: "icon-obs-entity",
      DATASET: "icon-obs-entity",
      DATASET_RUN: "icon-obs-entity",
      DATASET_ITEM: "icon-obs-entity",
      ANNOTATION_QUEUE: "icon-obs-entity",
      PROMPT: "icon-obs-entity",
      EVALUATOR: "icon-obs-entity",
      RUNNING_EVALUATOR: "icon-obs-entity",
      EXPERIMENT: "icon-obs-entity",
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
