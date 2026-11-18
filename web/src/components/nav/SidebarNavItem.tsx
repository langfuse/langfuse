import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { ArrowUpRight } from "@langfuse/icons";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { cn } from "@/src/utils/tailwind";
import styles from "./SidebarNavItem.module.css";

const rowVariants = cva(
  "text-sidebar-foreground flex w-full min-w-0 items-center rounded-sm text-left text-sm whitespace-nowrap transition-colors",
  {
    variants: {
      interaction: {
        interactive:
          "ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent cursor-pointer outline-hidden focus-visible:ring-2 aria-[current=page]:font-bold disabled:pointer-events-none disabled:opacity-50",
        static: "",
      },
    },
  },
);

type RowContentProps = {
  leading: ReactNode;
  label: string;
  external?: boolean;
  isLabelBold?: boolean;
  labelBadge?: ReactNode;
  trailing?: ReactNode;
};

function RowContent({
  leading,
  label,
  external,
  isLabelBold,
  labelBadge,
  trailing,
  isCollapsed,
}: RowContentProps & {
  isCollapsed: boolean;
}) {
  return (
    <>
      <span className={styles.leading} aria-hidden="true">
        {leading}
      </span>
      <span className={styles.content} aria-hidden={isCollapsed}>
        <span className={styles.caption}>
          <span
            title={label}
            className={cn(styles.label, isLabelBold && "font-bold")}
          >
            {label}
          </span>
          {external && <ArrowUpRight size="sm" color="tertiary" aria-hidden />}
          {labelBadge ? (
            <span className={styles.trailing}>{labelBadge}</span>
          ) : null}
        </span>
        {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      </span>
    </>
  );
}

/** Navigation labels can include explanatory help without changing the trigger. */
function NavigationTooltip({
  label,
  description,
  isCollapsed,
  children,
}: {
  label: string;
  description?: string;
  isCollapsed: boolean;
  children: ComponentProps<typeof FloatingController>["children"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <FloatingController
      enabled={isCollapsed || description !== undefined}
      open={open}
      onOpenChange={setOpen}
      role="tooltip"
      placement="right"
      openDelay={150}
      closeDelay={0}
      hoverableContent={false}
      renderContent={(props) => (
        <div
          {...props}
          className={cn(
            "bg-popover text-popover-foreground pointer-events-none overflow-hidden rounded-md border px-3 py-1.5 text-sm font-bold shadow-md",
            description && "max-w-xs whitespace-normal",
          )}
        >
          {label}
          {description ? (
            <p className="mt-1 text-xs font-normal">{description}</p>
          ) : null}
        </div>
      )}
    >
      {children}
    </FloatingController>
  );
}

function SidebarNavLink({
  href,
  isActive,
  opensInNewTab,
  onClick,
  onNavigate,
  ref,
  isCollapsed = false,
  ...content
}: RowContentProps & {
  href: string;
  isActive: boolean;
  opensInNewTab: boolean;
  onClick?: () => void;
  onNavigate?: ComponentProps<typeof Link>["onNavigate"];
  ref?: Ref<HTMLAnchorElement>;
  isCollapsed?: boolean;
}) {
  const linkProps = {
    href,
    target: opensInNewTab ? "_blank" : undefined,
    rel: opensInNewTab ? "noopener noreferrer" : undefined,
    "aria-current": isActive ? ("page" as const) : undefined,
  };
  return (
    <NavigationTooltip isCollapsed={isCollapsed} label={content.label}>
      {({ getTriggerProps }) => (
        <Link
          {...linkProps}
          onNavigate={onNavigate}
          {...getTriggerProps({ ref, onClick })}
          aria-label={isCollapsed ? content.label : undefined}
          data-collapsed={isCollapsed}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            styles.row,
          )}
        >
          <RowContent {...content} isCollapsed={isCollapsed} />
        </Link>
      )}
    </NavigationTooltip>
  );
}

function SidebarNavButton({
  ref,
  leading,
  label,
  external,
  isLabelBold,
  labelBadge,
  trailing,
  description,
  isCollapsed = false,
  ...buttonProps
}: RowContentProps &
  Omit<
    ComponentProps<"button">,
    "children" | "className" | "style" | "type"
  > & { isCollapsed?: boolean; description?: string }) {
  return (
    <NavigationTooltip
      isCollapsed={isCollapsed}
      label={buttonProps["aria-label"] ?? label}
      description={description}
    >
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps({ ...buttonProps, ref })}
          type="button"
          aria-label={buttonProps["aria-label"] ?? label}
          data-collapsed={isCollapsed}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            styles.row,
          )}
        >
          <RowContent
            leading={leading}
            label={label}
            external={external}
            isLabelBold={isLabelBold}
            labelBadge={labelBadge}
            trailing={trailing}
            isCollapsed={isCollapsed}
          />
        </button>
      )}
    </NavigationTooltip>
  );
}

function SidebarNavRow({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        rowVariants({ interaction: "static" }),
        styles.row,
        "gap-2 px-2",
      )}
    >
      {children}
    </div>
  );
}

export const SidebarNavItem = Object.assign(SidebarNavLink, {
  Button: SidebarNavButton,
  Row: SidebarNavRow,
});
