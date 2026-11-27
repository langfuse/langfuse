import { type ComponentProps } from "react";
import { CircleAlert, TriangleAlert } from "@langfuse/icons";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

type SessionToolStatusCountBadgeProps = {
  severity: "error" | "warning";
  ref?: ComponentProps<"span">["ref"];
} & Pick<ComponentProps<typeof BadgeShell>, "aria-label" | "tabIndex"> &
  (
    | { variant: "timeline"; count: number }
    | { variant: "sidebar"; count?: number }
  );

export function SessionToolStatusCountBadge({
  count,
  severity,
  variant,
  ...props
}: SessionToolStatusCountBadgeProps) {
  const { color, Icon } = (
    {
      error: { color: "error", Icon: CircleAlert },
      warning: { color: "warning", Icon: TriangleAlert },
    } satisfies Record<
      SessionToolStatusCountBadgeProps["severity"],
      {
        color: Extract<
          ComponentProps<typeof BadgeShell>["color"],
          "error" | "warning"
        >;
        Icon: typeof CircleAlert;
      }
    >
  )[severity];
  return (
    <BadgeShell color={color} size="sm" {...props}>
      {variant === "sidebar" && <Icon size="sm" aria-hidden="true" />}
      {variant === "timeline"
        ? `${count} ${severity}${count === 1 ? "" : "s"}`
        : count}
    </BadgeShell>
  );
}
