import type { HTMLAttributes } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export function Breadcrumb({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <nav aria-label="breadcrumb" className={cn(className)} {...props} />;
}

export function BreadcrumbList({
  className,
  ...props
}: HTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-2 text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbItem({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    />
  );
}

export function BreadcrumbPage({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-current="page"
      className={cn("text-foreground font-medium", className)}
      role="link"
      {...props}
    />
  );
}

export function BreadcrumbSeparator({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      aria-hidden="true"
      className={cn("text-muted-foreground/70", className)}
      role="presentation"
      {...props}
    >
      <ChevronRight size={14} />
    </li>
  );
}
