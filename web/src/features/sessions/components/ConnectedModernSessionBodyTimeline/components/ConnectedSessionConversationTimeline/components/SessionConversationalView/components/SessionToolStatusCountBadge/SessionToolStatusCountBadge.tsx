import { type ComponentProps } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type SessionToolStatusCountBadgeProps = {
  count: number;
  severity: "error" | "warning";
  variant: "timeline" | "sidebar";
  ref?: ComponentProps<"span">["ref"];
} & Pick<ComponentProps<typeof BadgeShell>, "aria-label" | "tabIndex">;

export function SessionToolStatusCountBadge({
  count,
  severity,
  variant,
  ...props
}: SessionToolStatusCountBadgeProps) {
  const { color, Icon } = (
    {
      error: { color: "red", Icon: CircleAlert },
      warning: { color: "yellow", Icon: TriangleAlert },
    } satisfies Record<
      SessionToolStatusCountBadgeProps["severity"],
      {
        color: Extract<
          ComponentProps<typeof BadgeShell>["color"],
          "red" | "yellow"
        >;
        Icon: typeof CircleAlert;
      }
    >
  )[severity];
  return (
    <BadgeShell color={color} size="sm" {...props}>
      {variant === "sidebar" && <Icon className="icon-sm" aria-hidden="true" />}
      {variant === "timeline"
        ? `${count} ${severity}${count === 1 ? "" : "s"}`
        : count}
    </BadgeShell>
  );
}
