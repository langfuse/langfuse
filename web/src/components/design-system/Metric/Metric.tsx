import { cva } from "class-variance-authority";
import { ArrowUpRight, type IconComponent } from "@langfuse/icons";
import Link, { type LinkProps } from "next/link";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/src/utils/tailwind";

const metricVariants = cva(
  "group/metric inline-flex w-fit max-w-full min-w-0 shrink-0 items-center font-mono text-xs leading-none font-normal text-foreground-secondary",
  {
    variants: {
      size: {
        default: "h-5.5 gap-1.5",
        sm: "h-4.5 gap-1",
      },
      shouldWrap: {
        true: "h-auto leading-snug",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      shouldWrap: false,
    },
  },
);

type MetricBaseProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "className" | "style" | "children"
> & {
  size?: "default" | "sm";
  /** Wraps a long value onto more lines instead of truncating it. */
  shouldWrap?: boolean;
  /** Links the metric: arrow after the value, underline on hover. */
  href?: LinkProps["href"];
  /** Opens `href` in a new tab. */
  newTab?: boolean;
  /** Keeps the value out of session recordings (ids, user names). */
  noCapture?: boolean;
};

type MetricProps = MetricBaseProps &
  (
    | {
        value: string;
        /** Key shown before the value, e.g. `latency` before `0.71s`. */
        label?: string;
        icon?: IconComponent;
        /** `warning` tints only the icon, e.g. a "no cost" metric. */
        iconTone?: "default" | "warning";
        /** Dotted underline: the metric opens a tooltip or hover card. */
        interactive?: boolean;
        children?: never;
      }
    | {
        /** Custom content in the metric box, e.g. a loading placeholder. */
        children: ReactNode;
        value?: never;
        label?: never;
        icon?: never;
        iconTone?: never;
        interactive?: never;
      }
  );

/**
 * A header metric or link: borderless, mono, muted. Latency, cost, tokens,
 * environment, model, session and user links in the trace, observation and
 * session headers.
 */
export function Metric({
  value,
  label,
  icon: Icon,
  iconTone = "default",
  interactive,
  children,
  size,
  shouldWrap,
  href,
  newTab,
  noCapture,
  title,
  ...props
}: MetricProps) {
  const isLink = href != null;
  const content =
    children ??
    (value != null && (
      <>
        {Icon && (
          <Icon
            aria-hidden
            size="sm"
            color={iconTone === "warning" ? "inherit" : "tertiary"}
            __rawClassName={
              iconTone === "warning" ? "text-dark-yellow" : undefined
            }
          />
        )}
        {label && <span className="shrink-0 py-0.5">{label}:</span>}
        <span
          className={cn(
            "py-0.5",
            shouldWrap
              ? "min-w-0 break-words whitespace-normal"
              : "text-ellipsis whitespace-nowrap",
            interactive
              ? "underline-dotted overflow-clip"
              : "overflow-x-clip overflow-y-visible",
            isLink && "underline-offset-2 group-hover/metric:underline",
          )}
          title={title ?? (interactive ? undefined : value)}
        >
          {value}
        </span>
        {isLink && (
          <ArrowUpRight
            aria-hidden
            size="sm"
            color="tertiary"
            __rawClassName="-ml-0.5"
          />
        )}
      </>
    ));

  const metric = (
    <span
      {...props}
      title={children != null ? title : undefined}
      className={cn(
        metricVariants({ size, shouldWrap }),
        noCapture && !isLink && "ph-no-capture",
      )}
    >
      {content}
    </span>
  );

  if (!isLink) return metric;

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
      {metric}
    </Link>
  );
}
