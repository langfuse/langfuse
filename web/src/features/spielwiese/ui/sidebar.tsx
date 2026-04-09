import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/src/utils/tailwind";

const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
  {
    variants: {
      active: {
        true: "bg-sidebar-accent text-sidebar-accent-foreground",
        false:
          "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      },
      compact: {
        true: "justify-center px-2.5",
        false: "",
      },
    },
    defaultVariants: {
      active: false,
      compact: false,
    },
  },
);

type SidebarMenuButtonProps = HTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    href: string;
  };

export function SidebarSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-sidebar text-sidebar-foreground flex h-full flex-col",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)} {...props} />
  );
}

export function SidebarContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0", className)}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-3 p-4 pt-0", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function SidebarGroupLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-sidebar-foreground/70 px-3 text-xs font-medium tracking-[0.18em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function SidebarMenuItem({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function SidebarMenuButton({
  active,
  className,
  compact,
  href,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(sidebarMenuButtonVariants({ active, compact }), className)}
      href={href}
      {...props}
    />
  );
}

export function SidebarMenuSub({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn(
        "border-sidebar-border/70 ml-4 flex flex-col gap-1 border-l pl-3",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({
  className,
  ...props
}: HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function SidebarMenuSubButton({
  active,
  className,
  href,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring/50 flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2",
        active && "bg-sidebar-accent/80 text-sidebar-accent-foreground",
        className,
      )}
      href={href}
      {...props}
    />
  );
}

export function SidebarSeparator({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-sidebar-border/70 h-px", className)} {...props} />
  );
}

export { sidebarMenuButtonVariants };
