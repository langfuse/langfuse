import { type ComponentProps, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";

/**
 * One row of the app sidebar navigation. Rows are context-free so feature
 * widgets (Support, cloud status, migration) render the same in any shell.
 */
const rowVariants = cva(
  "text-sidebar-foreground flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm whitespace-nowrap transition-colors",
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
  /** An icon element (`<Home size="base" />`) or a status dot. */
  leading: ReactNode;
  label: string;
  /** For rows that ask for attention, such as a required action. */
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
        className={
          isLabelBold
            ? "min-w-0 flex-1 truncate font-bold"
            : "min-w-0 flex-1 truncate"
        }
        title={label}
      >
        {label}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center">{trailing}</span>
      ) : null}
    </>
  );
}

function SidebarNavLink({
  href,
  isActive,
  opensInNewTab,
  onClick,
  ref,
  ...content
}: RowContentProps & {
  href: string;
  isActive: boolean;
  opensInNewTab: boolean;
  onClick?: () => void;
  ref?: Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={ref}
      href={href}
      target={opensInNewTab ? "_blank" : undefined}
      rel={opensInNewTab ? "noopener noreferrer" : undefined}
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
      className={rowVariants({ interaction: "interactive" })}
    >
      <RowContent {...content} />
    </Link>
  );
}

function SidebarNavButton({
  ref,
  leading,
  label,
  isLabelBold,
  trailing,
  ...buttonProps
}: RowContentProps &
  // Open-ended so the row can sit under a Radix `Trigger asChild`, which
  // injects its own handlers, ids and aria/data attributes.
  Omit<ComponentProps<"button">, "children" | "className" | "style" | "type">) {
  return (
    <button
      ref={ref}
      type="button"
      className={rowVariants({ interaction: "interactive" })}
      {...buttonProps}
    >
      <RowContent
        leading={leading}
        label={label}
        isLabelBold={isLabelBold}
        trailing={trailing}
      />
    </button>
  );
}

/** A non-interactive row for widgets that bring their own control, e.g. a labelled switch. */
function SidebarNavRow({ children }: { children: ReactNode }) {
  return (
    <div className={rowVariants({ interaction: "static" })}>{children}</div>
  );
}

export const SidebarNavItem = Object.assign(SidebarNavLink, {
  Button: SidebarNavButton,
  Row: SidebarNavRow,
});
