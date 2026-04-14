import { cva, type VariantProps } from "class-variance-authority";
import type { AnchorHTMLAttributes, HTMLAttributes, MouseEvent } from "react";
import { cn } from "@/src/utils/tailwind";

const sidebarMenuButtonVariants = cva(
  "text-sidebar-foreground/88 hover:bg-background/72 hover:text-sidebar-foreground focus-visible:ring-sidebar-ring/35 inline-flex h-8 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] leading-5 font-medium outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 [&_[data-sidebar-action]]:text-muted-foreground [&_[data-sidebar-action]]:inline-flex [&_[data-sidebar-action]]:size-4 [&_[data-sidebar-action]]:shrink-0 [&_[data-sidebar-action]]:items-center [&_[data-sidebar-action]]:justify-center [&_[data-sidebar-badge]]:bg-background [&_[data-sidebar-badge]]:text-muted-foreground [&_[data-sidebar-badge]]:inline-flex [&_[data-sidebar-badge]]:min-w-5 [&_[data-sidebar-badge]]:shrink-0 [&_[data-sidebar-badge]]:items-center [&_[data-sidebar-badge]]:justify-center [&_[data-sidebar-badge]]:rounded-full [&_[data-sidebar-badge]]:px-1.5 [&_[data-sidebar-badge]]:py-0.5 [&_[data-sidebar-badge]]:text-[11px] [&_[data-sidebar-badge]]:font-medium [&_[data-sidebar-badge]]:leading-none [&_[data-sidebar-icon]]:text-sidebar-foreground/68 [&_[data-sidebar-icon]]:size-3.5 [&_[data-sidebar-icon]]:shrink-0 [&_[data-sidebar-label]]:min-w-0 [&_[data-sidebar-label]]:flex-1 [&_[data-sidebar-label]]:truncate [&_[data-sidebar-meta]]:text-muted-foreground [&_[data-sidebar-meta]]:shrink-0 [&_[data-sidebar-meta]]:text-[12px] [&_[data-sidebar-meta]]:leading-none",
  {
    variants: {
      active: {
        true: "bg-background text-sidebar-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-border)/0.7)] [&_[data-sidebar-icon]]:text-sidebar-foreground/78",
        false: "",
      },
      compact: {
        true: "size-8 justify-center gap-0 rounded-[10px] px-0 [&_[data-sidebar-action]]:hidden [&_[data-sidebar-badge]]:hidden [&_[data-sidebar-label]]:hidden [&_[data-sidebar-meta]]:hidden",
        false: "",
      },
      tone: {
        default: "",
        primary:
          "h-7 gap-1.5 rounded-[9px] pr-1 pl-2 text-[0.875rem] leading-5 font-medium tracking-[-0.14px] text-[#242529] hover:bg-black/[0.06] hover:text-[#242529] [&_[data-sidebar-action]]:text-black/[0.4] [&_[data-sidebar-icon]]:text-black/[0.55] [&_[data-sidebar-label]]:font-medium [&_[data-sidebar-meta]]:text-black/[0.4]",
      },
    },
    compoundVariants: [
      {
        active: true,
        tone: "primary",
        className:
          "bg-[#EEEFF1] text-[#242529] shadow-none [&_[data-sidebar-icon]]:text-black/[0.55]",
      },
    ],
    defaultVariants: {
      active: false,
      compact: false,
      tone: "default",
    },
  },
);

type SidebarMenuButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    disabled?: boolean;
    href: string;
  };

function preventDisabledSidebarMenuButtonClick(
  event: MouseEvent<HTMLAnchorElement>,
) {
  event.preventDefault();
}

export function SidebarSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-full flex-col bg-[#F3F3F4] text-[#242529]",
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
        "text-sidebar-foreground/70 px-1 text-sm font-medium",
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
  return (
    <ul
      className={cn("flex flex-col gap-0.5", className)}
      role="list"
      {...props}
    />
  );
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
  disabled = false,
  href,
  onClick,
  tabIndex,
  tone,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <a
      aria-disabled={disabled || undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        sidebarMenuButtonVariants({ active, compact, tone }),
        disabled && "cursor-default",
        className,
      )}
      href={href}
      {...props}
      onClick={disabled ? preventDisabledSidebarMenuButtonClick : onClick}
      tabIndex={disabled ? -1 : tabIndex}
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
        sidebarMenuButtonVariants({ active }),
        "h-7 gap-2 rounded-lg pr-2 pl-2.5",
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
  return <div className={cn("bg-sidebar-border h-px", className)} {...props} />;
}

export { sidebarMenuButtonVariants };
