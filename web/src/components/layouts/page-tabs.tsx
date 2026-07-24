import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";
import { type ReactNode } from "react";

export type TabDefinition = {
  value: string;
  label: string;
  href?: string;
  onClick?: () => void;
  querySelector?: (
    query: ParsedUrlQuery,
  ) => Record<string, string | string[] | undefined>;
  disabled?: boolean;
  className?: string;
};

export type PageTabsProps = {
  tabs: TabDefinition[];
  activeTab: string;
  actionButtonsRight?: ReactNode;
  className?: string;
  listClassName?: string;
  /** Horizontal scroll for narrow viewports (mobile). */
  scrollable?: boolean;
};

/**
 * The page-level tab strip (sub-navigation within a section). Extracted so both
 * the desktop page header and the mobile page-title block can render it.
 */
export const PageTabs = ({
  tabs,
  activeTab,
  actionButtonsRight,
  className,
  listClassName,
  scrollable = false,
}: PageTabsProps) => {
  const router = useRouter();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2",
        actionButtonsRight ? "min-h-10" : "min-h-8",
        scrollable && "-mx-1 overflow-x-auto px-1",
        className,
      )}
    >
      <div
        className={cn(
          "inline-flex items-center justify-start",
          actionButtonsRight ? "h-10" : "h-8",
          listClassName,
        )}
      >
        {tabs.map((tab) => {
          const tabClassName = cn(
            "hover:bg-muted/50 focus-visible:ring-ring text-muted-foreground font-bold inline-flex h-full items-center justify-center rounded-none border-b-4 border-transparent px-2 py-0.5 text-sm whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
            tab.value === activeTab
              ? "border-primary-accent text-foreground bg-transparent shadow-none"
              : "",
            tab.disabled && "pointer-events-none opacity-50",
            tab.className,
          );

          if (tab.onClick) {
            return (
              <button
                key={tab.value}
                type="button"
                onClick={tab.onClick}
                className={tabClassName}
                disabled={tab.disabled}
              >
                {tab.label}
              </button>
            );
          }

          return (
            <Link
              key={tab.value}
              href={{
                pathname: tab.href ?? "",
                query: tab.querySelector?.(router.query),
              }}
              className={tabClassName}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {actionButtonsRight && (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {actionButtonsRight}
        </div>
      )}
    </div>
  );
};
