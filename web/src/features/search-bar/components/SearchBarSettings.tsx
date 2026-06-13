import Header from "@/src/components/layouts/header";
import { Card } from "@/src/components/ui/card";
import { Switch } from "@/src/components/ui/switch";
import { useSearchBarEnabled } from "@/src/features/search-bar/hooks/useSearchBarEnabled";

/**
 * Project settings card: opt the project into the grammar search bar on the
 * observations table. Only project admins/owners (`project:update`) can flip
 * it; everyone else sees the current state read-only.
 */
export function SearchBarSettings() {
  const { isEnabled, canToggle, setEnabled, isLoading } = useSearchBarEnabled();

  return (
    <div id="search-bar-settings">
      <Header title="Filter Search Bar (Beta)" />
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">
            Enable the query search bar on the observations table
          </span>
          <span className="text-muted-foreground text-sm">
            Replaces the filter sidebar and search field with a single
            keyboard-driven query bar (e.g.{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              level:ERROR -env:dev latency:&gt;2
            </code>
            ) with inline suggestions. Applies to all members of this project.
            Existing filters keep working — they are converted into the query on
            first use.
          </span>
        </div>
        <Switch
          checked={isEnabled}
          disabled={!canToggle || isLoading}
          onCheckedChange={(checked) => setEnabled(checked)}
          aria-label="Enable search bar"
        />
      </Card>
    </div>
  );
}
