/* eslint-disable @repo/no-style-props, @repo/no-margin-on-root-elements */
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { cn } from "@/src/utils/tailwind";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";

type TabDefinition = {
  value: string;
  label: string;
  href: string;
  onClick?: () => void;
  querySelector?: (
    query: ParsedUrlQuery,
  ) => Record<string, string | string[] | undefined>;
  disabled?: boolean;
};

export type PageTabsProps = {
  tabs: TabDefinition[];
  activeTab: string;
  className?: string;
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
  scrollable = false,
}: PageTabsProps) => {
  const router = useRouter();
  return (
    <div className={cn(scrollable && "-mx-1 overflow-x-auto px-1", className)}>
      <Tabs.List variant="underline">
        {tabs.map((tab) => (
          <Tabs.Trigger
            key={tab.value}
            href={{
              pathname: tab.href,
              query: tab.querySelector?.(router.query),
            }}
            active={tab.value === activeTab}
            onClick={tab.onClick}
            disabled={tab.disabled}
            label={tab.label}
          />
        ))}
      </Tabs.List>
    </div>
  );
};
