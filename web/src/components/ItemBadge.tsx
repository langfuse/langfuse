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
  | "RUNNING_EVALUATOR";

const iconMap = {
  TRACE: ListTree,
  GENERATION: Fan,
  EVENT: CircleDot,
  SPAN: MoveHorizontal,
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
} as const;

const iconVariants = cva(cn("h-4 w-4"), {
  variants: {
    type: {
      TRACE: "text-dark-green",
      GENERATION: "text-muted-magenta",
      EVENT: "text-muted-green",
      SPAN: "text-muted-blue",
      SESSION: "text-primary-accent",
      USER: "text-primary-accent",
      QUEUE_ITEM: "text-primary-accent",
      DATASET: "text-primary-accent",
      DATASET_RUN: "text-primary-accent",
      DATASET_ITEM: "text-primary-accent",
      ANNOTATION_QUEUE: "text-primary-accent",
      PROMPT: "text-primary-accent",
      EVALUATOR: "text-primary-accent",
      RUNNING_EVALUATOR: "text-primary-accent",
    },
  },
});

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
    iconVariants({ type }),
    isSmall ? "h-3 w-3" : "h-4 w-4",
    className,
  );

  const label =
    String(type).charAt(0).toUpperCase() + String(type).slice(1).toLowerCase();

  return (
    <Badge
      variant="outline"
      title={label}
      className={cn(
        "flex max-w-fit items-center gap-1 border-2 bg-background px-1",
        isSmall && "h-4",
      )}
    >
      <Icon className={iconClass} />
      {showLabel && <span>{label.replace(/_/g, " ")}</span>}
    </Badge>
  );
}
