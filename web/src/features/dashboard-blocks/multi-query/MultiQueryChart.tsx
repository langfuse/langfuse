import {
  normalizeMultiQueryConfig,
  type SavedMultiQueryConfig,
} from "@langfuse/shared/dashboards";
import { GripVerticalIcon, MoreVerticalIcon } from "@langfuse/icons";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
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
      className="ph-no-capture bg-background relative flex h-full min-h-0 flex-col gap-2 rounded-lg border p-4"
      aria-label={config.title}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3
          className="min-w-0 truncate text-base font-bold"
          title={config.title}
        >
          {config.title}
        </h3>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1">
            {actions.draggable ? (
              <GripVerticalIcon
                size="base"
                __rawClassName="drag-handle hidden cursor-grab active:cursor-grabbing lg:block"
              />
            ) : null}
            {actions.buttons?.map((action) => (
              <IconButton
                key={action.id}
                label={action.label}
                icon={action.icon}
                onClick={action.onClick}
                disabled={action.disabled}
                size="sm"
              />
            ))}
            {actions.menu && actions.menu.length > 0 ? (
              <DropdownMenu
                noCapture
                items={actions.menu}
                ariaLabel="Chart actions"
              >
                {({ getTriggerProps }) => (
                  <IconButton
                    {...getTriggerProps()}
                    label="Chart actions"
                    icon={MoreVerticalIcon}
                    size="sm"
                  />
                )}
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
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
