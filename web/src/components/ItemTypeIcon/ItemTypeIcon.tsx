/* eslint-disable @repo/no-style-props */
import { type ComponentProps } from "react";
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
} from "@langfuse/icons";
import { cva } from "class-variance-authority";
import { type LangfuseItemType } from "@/src/utils/itemType";
import { cn } from "@/src/utils/tailwind";

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
} as const satisfies Record<LangfuseItemType, typeof ListTree>;

const iconVariants = cva("", {
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

export function ItemTypeIcon({
  type,
  size,
  color,
  className,
}: {
  type: LangfuseItemType;
  size: ComponentProps<typeof ListTree>["size"];
  color: "type" | "white";
  className?: string;
}) {
  const Icon = iconMap[type];

  return (
    <Icon
      size={size}
      __rawClassName={cn(
        color === "white" ? "text-white" : iconVariants({ type }),
        className,
      )}
    />
  );
}
