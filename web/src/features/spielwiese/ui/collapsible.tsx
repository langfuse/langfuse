import type { HTMLAttributes } from "react";
import { cn } from "@/src/utils/tailwind";

type CollapsibleProps = HTMLAttributes<HTMLDetailsElement> & {
  defaultOpen?: boolean;
};

export function Collapsible({
  className,
  defaultOpen,
  ...props
}: CollapsibleProps) {
  return (
    <details
      className={cn("group/collapsible", className)}
      open={defaultOpen}
      {...props}
    />
  );
}

export function CollapsibleTrigger({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <summary
      className={cn("list-none [&::-webkit-details-marker]:hidden", className)}
      {...props}
    />
  );
}

export function CollapsibleContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-1", className)} {...props} />;
}
