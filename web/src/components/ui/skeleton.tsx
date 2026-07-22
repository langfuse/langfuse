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
    <div className={cn(skeletonVariants({ variant }), className)} {...props} />
  );
}

export { Skeleton };
