import Link from "next/link";
import { DownloadIcon, TableIcon, ListIcon } from "@langfuse/icons";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { downloadChartDataCsv } from "@/src/features/widgets/chart-library/downloadChartDataCsv";
import {
  buildTableFilterHref,
  buildScoreRecordsHref,
} from "@/src/features/dashboard/lib/buildTableFilterHref";
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
    <DialogController<"data" | "sources">
      renderDialog={({ state }) =>
        state === "data" ? (
          <Dialog
            title={`${config.title} · ${active.label}`}
            size="xxl"
            noCapture
          >
            <Dialog.Body>
              <div className="flex h-[65vh] min-h-0 flex-col">
                <MultiQueryResultView
                  config={runtime.config}
                  runtime={runtime}
                  asTable
                />
              </div>
            </Dialog.Body>
          </Dialog>
        ) : (
          <Dialog title="Explore source records" noCapture>
            <Dialog.Body>
              <p className="text-muted-foreground mb-4 text-sm">
                Choose a series from {active.label}. Formulas are calculated
                from these sources and do not have their own records.
              </p>
              <div className="space-y-4">
                {active.queries.map((source) => {
                  const query = runtime.plan?.queries.find(
                    (item) => item.source.id === source.id,
                  )?.query;
                  if (!query)
                    return (
                      <p key={source.id}>
                        {source.label} · Fix this series configuration to
                        explore its records.
                      </p>
                    );
                  const target = source.view.startsWith("scores-")
                    ? buildScoreRecordsHref(
                        context.projectId,
                        source.view,
                        query.filters,
                        runtime.dateRange,
                        {
                          homeScoreAggregate: source.homeScoreAggregate,
                          dimensions: source.dimensions.map(
                            (dimension) => dimension.field,
                          ),
                        },
                      )
                    : buildTableFilterHref(
                        context.projectId,
                        source.view,
                        query.filters,
                        runtime.dateRange,
                        context.readPath,
                      );
                  const missing = [...target.notApplicable.values()];
                  return (
                    <div key={source.id}>
                      <Link
                        className="font-medium underline"
                        href={target.href}
                      >
                        {source.label}
                      </Link>
                      {missing.length > 0 && (
                        <p className="text-muted-foreground text-sm">
                          Record-table scope differs: {missing.join("; ")}.
                        </p>
                      )}
                      {target.droppedForLength > 0 && (
                        <p className="text-muted-foreground text-sm">
                          {target.droppedForLength} filters cannot fit in the
                          record-table link.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Dialog.Body>
          </Dialog>
        )
      }
    >
      {({ openDialog }) => (
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
            <DataCardActionBar
              inline
              actions={{
                ...actions,
                menu: [
                  ...(actions?.menu ?? []),
                  {
                    id: "result-data",
                    type: "item",
                    title: "View result data",
                    icon: TableIcon,
                    onClick: () => {
                      openDialog("data");
                      capture("dashboard:block_interaction", {
                        blockKind: "multiQuery",
                        action: "view_result_data",
                        isV4: runtime.isV4,
                      });
                    },
                  },
                  {
                    id: "source-records",
                    type: "item",
                    title: "Explore source records",
                    icon: ListIcon,
                    onClick: () => {
                      openDialog("sources");
                      capture("dashboard:block_interaction", {
                        blockKind: "multiQuery",
                        action: "explore_source_records",
                        isV4: runtime.isV4,
                      });
                    },
                  },
                  {
                    id: "csv",
                    type: "item",
                    title: "Download active tab as CSV",
                    icon: DownloadIcon,
                    disabled: runtime.result.pending
                      ? { reason: "Chart data is still loading" }
                      : undefined,
                    onClick: () => {
                      downloadChartDataCsv(
                        runtime.result.values.map((row) => ({
                          Time: row.time ?? "",
                          Series: row.queryLabel,
                          Metric: row.metricLabel,
                          Breakdown: JSON.stringify(row.dimensions),
                          Bin: row.bin ?? "",
                          Value: row.value,
                          Unit: row.unit ?? "",
                          Evaluations: row.evaluationCount ?? "",
                        })),
                        `${config.title} - ${active.label}`,
                      );
                      capture("dashboard:block_interaction", {
                        blockKind: "multiQuery",
                        action: "download_csv",
                        isV4: runtime.isV4,
                      });
                    },
                  },
                ],
              }}
            />
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
      )}
    </DialogController>
  );
}
