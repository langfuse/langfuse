import { Badge } from "@/src/components/ui/badge";
import { CircleDot, Fan, ListTree, MoveHorizontal } from "lucide-react";
import { cva } from "class-variance-authority";
import { ObservationType } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";

export type LangfuseItemType = ObservationType | "TRACE";

const iconMap: Record<LangfuseItemType, React.ElementType> = {
  TRACE: ListTree,
  [ObservationType.GENERATION]: Fan,
  [ObservationType.EVENT]: CircleDot,
  [ObservationType.SPAN]: MoveHorizontal,
} as const;

const iconVariants = cva("h-3 w-3", {
  variants: {
    type: {
      TRACE: "text-green-700",
      [ObservationType.GENERATION]: "text-pink-600",
      [ObservationType.EVENT]: "text-teal-700",
      [ObservationType.SPAN]: "text-purple-700",
    },
    isSmall: {
      true: "h-3 w-3",
      false: "h-4 w-4",
    },
  },
  defaultVariants: {
    type: "TRACE",
    isSmall: false,
  },
});

export function ItemBadge(props: {
  type: LangfuseItemType;
  showLabel?: boolean;
  isSmall?: boolean;
}) {
  const Icon = iconMap[props.type];

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex max-w-fit items-center gap-1 bg-white",
        props.isSmall && "h-4",
      )}
    >
      <Icon
        className={iconVariants({ type: props.type, isSmall: props.isSmall })}
      />
      {props.showLabel && (
        <span>{props.type.charAt(0).toUpperCase() + props.type.slice(1)}</span>
      )}
    </Badge>
  );
}
