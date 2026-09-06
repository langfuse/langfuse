/* eslint-disable @repo/no-style-props */
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";
import { useSharedUiTranslations } from "@/src/utils/shared-ui-translations";

const PAGE_TAB_LABEL_KEYS = {
  Dashboards: "dashboards",
  Widgets: "widgets",
  Item: "item",
  Experiments: "experiments",
  Outputs: "outputs",
  Charts: "charts",
  "Running Evaluators": "runningEvaluators",
  "Evaluator Library": "evaluatorLibrary",
  Evaluators: "evaluators",
  Rules: "rules",
  Results: "results",
  Analytics: "analytics",
  Versions: "versions",
  Metrics: "metrics",
  Scores: "scores",
  Traces: "traces",
  Observations: "observations",
} as const;

type TabDefinition = {
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
  className,
  listClassName,
  scrollable = false,
}: PageTabsProps) => {
  const router = useRouter();
  const t = useSharedUiTranslations("pageTabs");
  return (
    <div className={cn(scrollable && "-mx-1 overflow-x-auto px-1", className)}>
      <div
        className={cn(
          "inline-flex h-8 items-center justify-start",
          listClassName,
        )}
      >
        {tabs.map((tab) => {
          const labelKey =
            PAGE_TAB_LABEL_KEYS[tab.label as keyof typeof PAGE_TAB_LABEL_KEYS];
          const label = labelKey ? t(labelKey) : tab.label;
          const tabClassName = cn(
            "hover:bg-muted/50 focus-visible:ring-ring text-muted-foreground font-bold inline-flex h-full items-center justify-center rounded-none border-b-4 border-transparent px-2 py-0.5 text-sm whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
            tab.value === activeTab
              ? "border-primary-accent text-foreground bg-transparent shadow-none"
              : "",
            tab.disabled && "pointer-events-none opacity-50",
            tab.className,
          );

          if (tab.href) {
            return (
              <Link
                key={tab.value}
                href={{
                  pathname: tab.href ?? "",
                  query: tab.querySelector?.(router.query),
                }}
                className={tabClassName}
                onClick={tab.onClick}
              >
                {label}
              </Link>
            );
          }

          if (tab.onClick) {
            return (
              <button
                key={tab.value}
                type="button"
                onClick={tab.onClick}
                className={tabClassName}
                disabled={tab.disabled}
              >
                {label}
              </button>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
};
