import { ArrowUpRight } from "lucide-react";
import Link, { type LinkProps } from "next/link";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { cn } from "@/src/utils/tailwind";

type LinkBadgeProps = {
  href: LinkProps["href"];
  text: string;
  /** Key shown muted before the value, e.g. `user` before the id. */
  label?: string;
  title?: string;
  /** Opens in a new tab. */
  newTab?: boolean;
  /** Keeps the value out of session recordings (ids, user names). */
  noCapture?: boolean;
} & { [key: `data-${string}`]: string };

/** A metric that links somewhere: ghost, mono, arrow, underline on hover. */
export function LinkBadge({
  href,
  text,
  label,
  title,
  newTab,
  noCapture,
  ...dataProps
}: LinkBadgeProps) {
  return (
    <Link
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      className={cn(
        "inline-flex max-w-full min-w-0",
        noCapture && "ph-no-capture",
      )}
    >
      <Badge
        color="ghost"
        font="mono"
        label={label}
        text={text}
        title={title}
        trailingIcon={ArrowUpRight}
        trailingIconTone="link"
        {...dataProps}
      />
    </Link>
  );
}
