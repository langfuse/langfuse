import { Badge } from "@/src/components/ui/badge";
import {
  CircleDot,
  ClipboardPen,
  Database,
  Fan,
  ListTree,
  MoveHorizontal,
  Shell,
  User,
  FileText,
  FlaskConical,
  ListTodo,
  WandSparkles,
  Cog,
  TestTubeDiagonal,
} from "lucide-react";
import { cva } from "class-variance-authority";
import { ObservationType } from "@langfuse/shared";
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
  | "EVAL_TEMPLATE";

const iconMap: Record<LangfuseItemType, React.ElementType> = {
  TRACE: ListTree,
  [ObservationType.GENERATION]: Fan,
  [ObservationType.EVENT]: CircleDot,
  [ObservationType.SPAN]: MoveHorizontal,
  SESSION: Shell,
  USER: User,
  QUEUE_ITEM: ClipboardPen,
  DATASET: Database,
  DATASET_RUN: FlaskConical,
  DATASET_ITEM: TestTubeDiagonal,
  ANNOTATION_QUEUE: ListTodo,
  PROMPT: FileText,
  EVALUATOR: WandSparkles,
  EVAL_TEMPLATE: Cog,
} as const;

const iconVariants = cva(cn("h-4 w-4"), {
  variants: {
    type: {
      TRACE: "text-green-700",
      [ObservationType.GENERATION]: "text-pink-600",
      [ObservationType.EVENT]: "text-teal-700",
      [ObservationType.SPAN]: "text-purple-700",
      SESSION: "text-primary-accent",
      USER: "text-primary-accent",
      QUEUE_ITEM: "text-primary-accent",
      DATASET: "text-primary-accent",
      DATASET_RUN: "text-primary-accent",
      DATASET_ITEM: "text-primary-accent",
      ANNOTATION_QUEUE: "text-primary-accent",
      PROMPT: "text-primary-accent",
      EVALUATOR: "text-primary-accent",
      EVAL_TEMPLATE: "text-primary-accent",
    },
  },
});

export function ItemBadge({
  type,
  showLabel = false,
  isSmall = false,
}: {
  type: LangfuseItemType;
  showLabel?: boolean;
  isSmall?: boolean;
}) {
  const Icon = iconMap[type] || ListTree; // Default to ListTree if unknown type
  const iconClass = cn(iconVariants({ type }), isSmall ? "h-3 w-3" : "h-4 w-4");
  const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex max-w-fit items-center gap-1 bg-background",
        isSmall && "h-4",
      )}
    >
      <Icon className={iconClass} />
      {showLabel && <span>{label.replace(/_/g, " ")}</span>}
    </Badge>
  );
}
