/* eslint-disable @repo/no-style-props */
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/utils/tailwind";

const skeletonVariants = cva("animate-pulse rounded-md", {
  variants: {
    variant: {
      default: "bg-muted",
      contrast: "bg-border-contrast",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Skeleton({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    />
  );
}

/**
 * Skeletons standing in for one surface. Invisible for the first 150ms so a
 * fast load never flashes them; static fill, no pulse; inert, so real controls
 * rendered as part of the placeholder take no input.
 */
function SkeletonGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      inert
      className={cn(
        "animate-appear-delayed opacity-0 [&_[data-slot=skeleton]]:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton, SkeletonGroup };
