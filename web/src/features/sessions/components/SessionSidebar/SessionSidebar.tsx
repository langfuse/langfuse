import { type ReactNode } from "react";
import { Filter, Search } from "@langfuse/icons";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/ui/input";

export function SessionSidebar({
  label,
  isLoading,
  children,
  search,
  isListScrolled,
}: {
  label: string;
  isLoading?: boolean;
  children?: ReactNode;
  search?: {
    search: string;
    onSearchChange: (search: string) => void;
    customization?: { activeFilterCount: number; onCustomizeView: () => void };
    disabled?: boolean;
  };
  isListScrolled?: boolean;
}) {
  const customization = search?.customization;
  return (
    <div
      role="complementary"
      aria-label={label}
      aria-busy={isLoading || undefined}
      className="bg-background session-review-stack:border-r-0 session-review-stack:border-b relative flex h-full min-h-0 flex-col border-r"
    >
      {search && (
        <div className="relative z-10 shrink-0">
          <div className="relative z-10 flex shrink-0 items-center gap-1 p-4">
            <div className="relative min-w-0 flex-1">
              <Search
                size="base"
                color="tertiary"
                __rawClassName="absolute top-1/2 left-2 -translate-y-1/2"
              />
              <Input
                disabled={search.disabled}
                value={search.search}
                onChange={(event) => search.onSearchChange(event.target.value)}
                aria-label="Search session"
                placeholder="Search session"
                className="h-8 rounded-sm bg-transparent pl-7 font-mono text-xs"
              />
            </div>
            {customization && (
              <Tooltip
                label={`Customize view${customization.activeFilterCount > 0 ? ` (${customization.activeFilterCount})` : ""}`}
              >
                {({ getTriggerProps }) => (
                  <IconButton
                    {...getTriggerProps()}
                    icon={Filter}
                    size="md"
                    variant="outline"
                    label="Customize view"
                    onClick={customization.onCustomizeView}
                  />
                )}
              </Tooltip>
            )}
          </div>
          {isListScrolled && (
            <div
              aria-hidden="true"
              className="from-background pointer-events-none absolute inset-x-0 top-full h-6 bg-linear-to-b to-transparent"
            />
          )}
        </div>
      )}
      {isLoading ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-0.5 pb-4">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-md border p-2"
            >
              <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
              <div className="bg-muted h-2.5 w-1/2 animate-pulse rounded-sm" />
            </div>
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
