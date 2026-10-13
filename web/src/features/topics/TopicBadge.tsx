import { type ComponentProps } from "react";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function TopicBadge({ row, color, size }: TopicBadgeProps) {
  return (
    <Badge
      text={row.topicName ?? row.outcome.replaceAll("_", " ")}
      color={color}
      size={size}
      shouldWrap
    />
  );
}

type TopicBadgeProps = {
  row: { topicName: string | null; outcome: string };
  color: ComponentProps<typeof Badge>["color"];
  size: "default" | "sm";
};
