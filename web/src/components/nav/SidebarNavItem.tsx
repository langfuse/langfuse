import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { FloatingController } from "@/src/components/design-system/FloatingController/FloatingController";
import { cn } from "@/src/utils/tailwind";

const rowVariants = cva(
  "text-sidebar-foreground flex h-11 w-full min-w-0 items-center gap-2 md:h-9 rounded-md px-2 text-left text-sm whitespace-nowrap transition-colors",
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
}: RowContentProps) {
  return (
    <>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {leading}
      </span>
      <span
        title={label}
        className={cn("min-w-0 flex-1 truncate", isLabelBold && "font-bold")}
      >
        {label}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center">{trailing}</span>
      ) : null}
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
  const [open, setOpen] = useState(false);
  return (
    <FloatingController
      enabled={isCollapsed}
      open={open}
      onOpenChange={setOpen}
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
          {renderExpandedRow(() => setOpen(false))}
        </div>
      )}
    >
      {({ getTriggerProps }) =>
        children({
          getTriggerProps: (props) =>
            getTriggerProps({
              ...props,
              onBlur: (event) => {
                props?.onBlur?.(event);
                if (!isCollapsed) setOpen(false);
              },
              onMouseLeave: (event) => {
                props?.onMouseLeave?.(event);
                if (!isCollapsed) setOpen(false);
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
            "gap-0 px-0 pr-3",
          )}
        >
          <span className="flex h-9 w-10 shrink-0 items-center justify-center">
            {content.leading}
          </span>
          <span
            className={cn("flex-1 pr-3", content.isLabelBold && "font-bold")}
          >
            {content.label}
          </span>
          {content.trailing}
        </Link>
      )}
    >
      {({ getTriggerProps }) => (
        <Link
          {...linkProps}
          {...getTriggerProps({ ref, onClick })}
          aria-label={isCollapsed ? content.label : undefined}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            isCollapsed && "h-9 w-10 justify-center gap-0 px-0",
          )}
        >
          {isCollapsed ? content.leading : <RowContent {...content} />}
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
            "gap-0 px-0 pr-3",
          )}
        >
          <span className="flex h-9 w-10 shrink-0 items-center justify-center">
            {leading}
          </span>
          <span className={cn("flex-1 pr-3", isLabelBold && "font-bold")}>
            {label}
          </span>
          {trailing}
        </button>
      )}
    >
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps({ ...buttonProps, ref })}
          type="button"
          aria-label={buttonProps["aria-label"] ?? label}
          className={cn(
            rowVariants({ interaction: "interactive" }),
            isCollapsed && "h-9 w-10 justify-center gap-0 px-0",
          )}
        >
          {isCollapsed ? (
            leading
          ) : (
            <RowContent
              leading={leading}
              label={label}
              isLabelBold={isLabelBold}
              trailing={trailing}
            />
          )}
        </button>
      )}
    </RailEntry>
  );
}

function SidebarNavRow({ children }: { children: ReactNode }) {
  return (
    <div className={rowVariants({ interaction: "static" })}>{children}</div>
  );
}

export const SidebarNavItem = Object.assign(SidebarNavLink, {
  Button: SidebarNavButton,
  Row: SidebarNavRow,
});
