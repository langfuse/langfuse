import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { cn } from "@/src/utils/tailwind";
import styles from "./SidebarNavItem.module.css";

const rowVariants = cva(
  "text-sidebar-foreground flex h-11 w-full min-w-0 items-center rounded-md text-left text-sm whitespace-nowrap transition-colors md:h-9",
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
  isLabelBold?: boolean;
  trailing?: ReactNode;
};

function RowContent({
  leading,
  label,
  isLabelBold,
  trailing,
  isCollapsed,
  leadingRef,
}: RowContentProps & {
  isCollapsed: boolean;
  leadingRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <>
      <span ref={leadingRef} className={styles.leading} aria-hidden="true">
        {leading}
      </span>
      <span className={styles.content} aria-hidden={isCollapsed}>
        <span
          title={label}
          className={cn(styles.label, isLabelBold && "font-bold")}
        >
          {label}
        </span>
        {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
      </span>
    </>
  );
}

/** A rail entry reveals only its own row, with one keyboard target and no layout shift. */
function RailEntry({
  label,
  isCollapsed,
  children,
  renderExpandedRow,
}: {
  label: string;
  isCollapsed: boolean;
  children: ComponentProps<typeof FloatingController>["children"];
  renderExpandedRow: (close: () => void) => ReactNode;
}) {
  const [previewIntent, setPreviewIntent] = useState(false);
  return (
    <FloatingController
      open={isCollapsed && previewIntent}
      onOpenChange={setPreviewIntent}
      role="tooltip"
      placement="right"
      sideOffset={-40}
      openDelay={100}
      closeDelay={100}
      hideWhenDetached
      renderContent={(props) => (
        <div
          {...props}
          aria-label={label}
          data-sidebar-item-preview=""
          className="bg-sidebar text-sidebar-foreground max-w-xs min-w-40 rounded-md border shadow-md"
        >
          {renderExpandedRow(() => setPreviewIntent(false))}
        </div>
      )}
    >
      {({ getTriggerProps, setPositionReference }) =>
        children({
          setPositionReference,
          getTriggerProps: (props) =>
            getTriggerProps({
              ...props,
              onMouseLeave: (event) => {
                props?.onMouseLeave?.(event);
                // There is no floating surface for safePolygon in expanded mode.
                // Keep keyboard focus intent until the real trigger blurs.
                if (
                  !isCollapsed &&
                  !event.currentTarget.matches(":focus-visible")
                ) {
                  setPreviewIntent(false);
                }
              },
            }),
        })
      }
    </FloatingController>
  );
}

function SidebarNavLink({
  href,
  isActive,
  opensInNewTab,
  onClick,
  ref,
  isCollapsed = false,
  ...content
}: RowContentProps & {
  href: string;
  isActive: boolean;
  opensInNewTab: boolean;
  onClick?: () => void;
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
    <RailEntry
      isCollapsed={isCollapsed}
      label={content.label}
      renderExpandedRow={(close) => (
        <Link
          {...linkProps}
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          aria-hidden="true"
          onClick={() => {
            close();
            onClick?.();
          }}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            styles.row,
          )}
        >
          <RowContent {...content} isCollapsed={false} />
        </Link>
      )}
    >
      {({ getTriggerProps, setPositionReference }) => (
        <Link
          {...linkProps}
          {...getTriggerProps({ ref, onClick })}
          aria-label={isCollapsed ? content.label : undefined}
          data-collapsed={isCollapsed}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            styles.row,
          )}
        >
          <RowContent
            {...content}
            isCollapsed={isCollapsed}
            leadingRef={setPositionReference}
          />
        </Link>
      )}
    </RailEntry>
  );
}

function SidebarNavButton({
  ref,
  leading,
  label,
  isLabelBold,
  trailing,
  isCollapsed = false,
  ...buttonProps
}: RowContentProps &
  Omit<
    ComponentProps<"button">,
    "children" | "className" | "style" | "type"
  > & { isCollapsed?: boolean }) {
  return (
    <RailEntry
      isCollapsed={isCollapsed}
      label={buttonProps["aria-label"] ?? label}
      renderExpandedRow={(close) => (
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          aria-hidden="true"
          disabled={buttonProps.disabled}
          onClick={(event) => {
            close();
            buttonProps.onClick?.(event);
          }}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            styles.row,
          )}
        >
          <RowContent
            leading={leading}
            label={label}
            isLabelBold={isLabelBold}
            trailing={trailing}
            isCollapsed={false}
          />
        </button>
      )}
    >
      {({ getTriggerProps, setPositionReference }) => (
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
            isLabelBold={isLabelBold}
            trailing={trailing}
            isCollapsed={isCollapsed}
            leadingRef={setPositionReference}
          />
        </button>
      )}
    </RailEntry>
  );
}

function SidebarNavRow({ children }: { children: ReactNode }) {
  return (
    <div className={cn(rowVariants({ interaction: "static" }), "gap-2 px-2")}>
      {children}
    </div>
  );
}

export const SidebarNavItem = Object.assign(SidebarNavLink, {
  Button: SidebarNavButton,
  Row: SidebarNavRow,
});
