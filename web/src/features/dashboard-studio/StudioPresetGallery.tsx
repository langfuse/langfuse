import { type ReactNode, useState } from "react";
import {
  HOME_DASHBOARD_PRESET_IDS,
  getStudioPresetReplacement,
  type DashboardDefinition,
  type HomeDashboardPresetId,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import {
  BarChart3Icon,
  ArrowRightIcon,
  TableIcon,
  ActivityIcon,
} from "@langfuse/icons";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Input } from "@/src/components/design-system/Input/Input";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";

type LegacyPlacement = Extract<
  DashboardDefinition["widgets"][number],
  { type: "preset" }
>;
type GalleryView = "templates" | "legacy";

function TemplateBrowser({
  initialView,
  legacyPlacements,
  onAdd,
  onCompare,
  onViewChange,
}: {
  initialView: GalleryView;
  legacyPlacements: LegacyPlacement[];
  onAdd: (
    presetId: HomeDashboardPresetId,
    configs: StudioWidgetConfig[],
  ) => void;
  onCompare: (placement: LegacyPlacement) => void;
  onViewChange: (view: GalleryView) => void;
}) {
  const [search, setSearch] = useState("");
  const recipes = HOME_DASHBOARD_PRESET_IDS.map((id) => ({
    id,
    configs: getStudioPresetReplacement(id),
  }));
  const filtered = recipes.filter(({ configs }) =>
    `${configs[0]?.title} ${configs[0]?.description ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Dialog title="Chart templates" size="lg" closeLabel="Close" noCapture>
      <Dialog.Body>
        <Tabs
          defaultValue={initialView}
          onValueChange={(value) => onViewChange(value as GalleryView)}
        >
          <Tabs.List variant="underline" aria-label="Template library">
            <Tabs.Trigger value="templates" label="Templates" />
            {legacyPlacements.length ? (
              <Tabs.Trigger
                value="legacy"
                label={`Legacy widgets (${legacyPlacements.length})`}
              />
            ) : null}
          </Tabs.List>
          <Tabs.Content value="templates">
            <div className="flex flex-col gap-4 pt-4">
              <p className="text-muted-foreground text-sm">
                Start with a common metric, then edit its data, filters and
                appearance.
              </p>
              <Input
                aria-label="Search templates"
                placeholder="Search templates…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map(({ id, configs }) => {
                  const first = configs[0]!;
                  let Icon = BarChart3Icon;
                  if (first.display.chartType === "PIVOT_TABLE")
                    Icon = TableIcon;
                  else if (first.display.timeSeries) Icon = ActivityIcon;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onAdd(id, configs)}
                      className="hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-ring flex min-w-0 items-start gap-3 rounded-lg border p-4 text-left outline-hidden focus-visible:ring-2"
                    >
                      <Icon size="lg" color="muted" />
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <span className="text-sm font-medium">
                          {first.title}
                        </span>
                        <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                          {first.description}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {configs.length > 1
                            ? `${configs.length} editable charts`
                            : "Editable chart"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!filtered.length ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No templates match your search.
                </p>
              ) : null}
            </div>
          </Tabs.Content>
          <Tabs.Content value="legacy">
            <div className="flex flex-col gap-3 pt-4">
              <p className="text-muted-foreground text-sm">
                Compare a legacy widget with its editable replacement before
                changing this dashboard.
              </p>
              {legacyPlacements.map((placement) => (
                <button
                  key={placement.id}
                  type="button"
                  onClick={() => onCompare(placement)}
                  className="hover:bg-muted focus-visible:ring-ring flex items-center justify-between gap-3 rounded-lg border p-4 text-left text-sm outline-hidden focus-visible:ring-2"
                >
                  <span>
                    {
                      getStudioPresetReplacement(
                        placement.presetId as HomeDashboardPresetId,
                      )[0]?.title
                    }
                  </span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs">
                    Compare <ArrowRightIcon size="base" />
                  </span>
                </button>
              ))}
            </div>
          </Tabs.Content>
        </Tabs>
      </Dialog.Body>
    </Dialog>
  );
}

export function StudioPresetGallery({
  legacyPlacements,
  onAdd,
  onCompare,
  onViewChange,
  children,
}: {
  legacyPlacements: LegacyPlacement[];
  onAdd: (
    presetId: HomeDashboardPresetId,
    configs: StudioWidgetConfig[],
  ) => void;
  onCompare: (placement: LegacyPlacement) => void;
  onViewChange: (view: GalleryView) => void;
  children: (control: {
    openGallery: (view: GalleryView) => void;
  }) => ReactNode;
}) {
  return (
    <DialogController<GalleryView>
      renderDialog={({ state, closeDialog }) => (
        <TemplateBrowser
          initialView={state}
          onViewChange={onViewChange}
          legacyPlacements={legacyPlacements}
          onAdd={(id, configs) => {
            closeDialog();
            onAdd(id, configs);
          }}
          onCompare={(placement) => {
            closeDialog();
            onCompare(placement);
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openGallery: (view) => {
            onViewChange(view);
            openDialog(view);
          },
        })
      }
    </DialogController>
  );
}
