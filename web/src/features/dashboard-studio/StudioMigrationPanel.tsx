import {
  getStudioPresetReplacement,
  type DashboardDefinition,
  type FilterState,
  type HomeDashboardPresetId,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { XIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { StudioQueryWidget } from "./StudioQueryWidget";
type LegacyPlacement = Extract<
  DashboardDefinition["widgets"][number],
  { type: "preset" }
>;
export function StudioMigrationPanel({
  projectId,
  dashboardId,
  placement,
  readPath,
  dateRange,
  filterState,
  onReplace,
  onKeepBoth,
  onCancel,
}: {
  projectId: string;
  dashboardId: string;
  placement: LegacyPlacement;
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
  onReplace: (configs: StudioWidgetConfig[]) => void;
  onKeepBoth: (configs: StudioWidgetConfig[]) => void;
  onCancel: () => void;
}) {
  const configs = getStudioPresetReplacement(
    placement.presetId as HomeDashboardPresetId,
  );
  return (
    <section className="bg-background flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Replace a legacy widget</h2>
          <p className="text-muted-foreground text-sm">
            Compare the same time range and dashboard filters, then choose how
            to continue.
          </p>
        </div>
        <IconButton icon={XIcon} label="Close comparison" onClick={onCancel} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="text-muted-foreground mb-2 text-xs font-bold">
            Current widget
          </p>
          <DashboardGrid
            widgets={[{ ...placement, x: 0, y: 0, x_size: 12, y_size: 5 }]}
            onChange={() => undefined}
            canEdit={false}
            dashboardId={dashboardId}
            projectId={projectId}
            readPath={readPath}
            dateRange={dateRange}
            filterState={filterState}
            onDeleteWidget={() => undefined}
            dashboardOwner="PROJECT"
            readOnly
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-primary text-xs font-bold">Editable replacement</p>
          {configs.map((config, index) => (
            <div className="h-96" key={index}>
              <StudioQueryWidget
                projectId={projectId}
                config={config}
                readPath={readPath}
                dateRange={dateRange}
                filterState={filterState}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-muted/50 rounded-md p-3 text-sm">
        <p className="font-bold">What changes?</p>
        {configs.map((config, index) => (
          <p className="text-muted-foreground mt-1" key={index}>
            {config.description}
          </p>
        ))}
        <p className="text-muted-foreground mt-2 text-xs">
          View all metrics, filters, breakdowns, and formulas in the editor. You
          can undo this change during the editing session.
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button text="Cancel" variant="ghost" onClick={onCancel} />
        <Button
          text="Keep both versions"
          variant="outline"
          onClick={() => onKeepBoth(configs)}
        />
        <Button text="Replace widget" onClick={() => onReplace(configs)} />
      </div>
    </section>
  );
}
