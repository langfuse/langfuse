import {
  normalizeMultiQueryConfig,
  type SavedMultiQueryConfig,
} from "@langfuse/shared/dashboards";
import {
  DataCardActionBar,
  type DataCardActions,
} from "@/src/components/design-system/DataCardActionBar/DataCardActionBar";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  useMultiQueryWidget,
  type MultiQueryWidgetContext,
} from "./useMultiQueryWidget";
import { MultiQueryResultView } from "./MultiQueryResultView";

export function MultiQueryChart({
  config: savedConfig,
  selectedTabId,
  onSelectTab,
  actions,
  ...context
}: MultiQueryWidgetContext & {
  config: SavedMultiQueryConfig;
  selectedTabId?: string;
  onSelectTab: (id: string) => void;
  actions?: DataCardActions;
}) {
  const config = normalizeMultiQueryConfig(savedConfig);
  const active =
    config.tabs.find((tab) => tab.id === selectedTabId) ?? config.tabs[0]!;
  const runtime = useMultiQueryWidget(active, context, true);
  const capture = usePostHogClientCapture();
  const plot = (
    <MultiQueryResultView
      key={active.id}
      config={runtime.config}
      runtime={runtime}
    />
  );
  return (
    <section
      className="ph-no-capture bg-background group relative flex h-full min-h-0 flex-col gap-2 rounded-lg border p-4"
      aria-label={config.title}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3
          className="min-w-0 truncate text-base font-bold"
          title={config.title}
        >
          {config.title}
        </h3>
        {actions && <DataCardActionBar inline actions={actions} />}
      </div>
      {config.description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {config.description}
        </p>
      ) : null}
      {config.tabs.length > 1 ? (
        <Tabs
          layout="fill"
          value={active.id}
          onValueChange={(id) => {
            if (id === active.id) return;
            onSelectTab(id);
            capture("dashboard:block_interaction", {
              blockKind: "multiQuery",
              action: "multi_query_tab_changed",
              isV4: runtime.isV4,
            });
          }}
        >
          <TabBar
            label="Widget tabs"
            tabs={config.tabs.map((tab) => ({
              value: tab.id,
              label: tab.label,
              noCapture: true,
            }))}
          />
          <Tabs.Content layout="fill" value={active.id}>
            {plot}
          </Tabs.Content>
        </Tabs>
      ) : (
        plot
      )}
    </section>
  );
}
