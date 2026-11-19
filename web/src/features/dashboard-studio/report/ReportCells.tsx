import { useState } from "react";
import { PencilIcon } from "@langfuse/icons";
import {
  type DashboardDomain,
  type FilterState,
  type HomeDashboardPresetId,
} from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { ReportMarkdown } from "./ReportMarkdown";
import { getHomePresetMetadata } from "@/src/features/dashboard/components/home-preset-registry";
import type { ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { DashboardWidget } from "@/src/features/widgets/components/DashboardWidget";
import { PresetDashboardWidget } from "@/src/features/widgets/components/PresetDashboardWidget";
import { StudioQueryWidget } from "../StudioQueryWidget";
import { legacyReport } from "./legacyReport";
import type {
  ReportNote,
  ReportPlacement,
  ReportPreset,
  ReportQuery,
} from "./reportSections";

type OutputContext = {
  projectId: string;
  dashboardId: string;
  dashboardOwner: DashboardDomain["owner"];
  readPath: ResolvedReadPath;
  dateRange: { from: Date; to: Date };
  filterState: FilterState;
};

function LegacyOutput({
  placement,
  context,
}: {
  placement: Extract<ReportPlacement, { type: "preset" | "widget" }>;
  context: OutputContext;
}) {
  const [activeKey, setActiveKey] = useState<string>();
  const props = {
    ...context,
    readOnly: true,
    chartSync: { activeKey, onActiveKeyChange: setActiveKey },
    onDeleteWidget: () => undefined,
  };
  return (
    <div className="h-[24rem] min-w-0 overflow-auto">
      {placement.type === "preset" ? (
        <PresetDashboardWidget
          {...props}
          placement={placement}
          heightBehavior={{ mode: "fixed" }}
        />
      ) : (
        <DashboardWidget {...props} placement={placement} />
      )}
    </div>
  );
}

function QueryOutput({
  cell,
  context,
  onEdit,
}: {
  cell: ReportQuery;
  context: OutputContext;
  onEdit?: (cell: ReportQuery) => void;
}) {
  const current = cell.config.executionMode === "current";
  const inputs = cell.config.queries.length;
  return (
    <figure className="min-w-0">
      <div className="h-[21rem] min-w-0 sm:h-[23rem]">
        <StudioQueryWidget
          projectId={context.projectId}
          readPath={context.readPath}
          dateRange={context.dateRange}
          filterState={context.filterState}
          config={cell.config}
        />
      </div>
      <figcaption className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-xs">
        <span>
          {current ? "Existing query API" : "Prototype query API"} · {inputs}{" "}
          {inputs === 1 ? "source query" : "source queries"}
        </span>
        {onEdit && (
          <Button
            size="sm"
            variant="ghost"
            icon={PencilIcon}
            text="Edit chart"
            onClick={() => onEdit(cell)}
          />
        )}
      </figcaption>
    </figure>
  );
}

type Comparison = { before: ReportPreset; after: ReportQuery[] };
const statusText = {
  matched: "Same measure and grouping",
  changed: "Definition changes",
  review: "Needs verification",
};
const detailsFor = (item: ReportPreset) =>
  Object.hasOwn(legacyReport, item.presetId)
    ? legacyReport[item.presetId as HomeDashboardPresetId]
    : undefined;

function ReportComparisons({
  pairs,
  context,
  onEdit,
  selected,
  onSelect,
}: {
  pairs: Comparison[];
  context: OutputContext;
  onEdit?: (cell: ReportQuery) => void;
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const pair = pairs.find((p) => p.before.presetId === selected) ?? pairs[0];
  const [variant, setVariant] = useState("");
  const replacement =
    pair.after.find((item) => item.id === variant) ?? pair.after[0];
  const details = detailsFor(pair.before);
  return (
    <section aria-label="Legacy widget comparison" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="flex w-full max-w-lg flex-col gap-1.5 text-sm font-medium">
          Home card
          <SelectInput
            aria-label="Home card"
            value={pair.before.presetId}
            options={pairs.map((p) => ({
              value: p.before.presetId,
              label: detailsFor(p.before)
                ? getHomePresetMetadata(
                    p.before.presetId as HomeDashboardPresetId,
                    context.readPath === "v4" ? "v2" : "v1",
                  ).name
                : p.before.presetId,
            }))}
            placeholder="Select a Home card"
            onValueChange={onSelect}
          />
        </label>
        <span className="text-muted-foreground pb-2 text-xs">
          {pairs.findIndex((p) => p === pair) + 1} of {pairs.length} cards
        </span>
      </div>
      {details && (
        <div className="space-y-1">
          <h3 className="text-xl font-bold tracking-tight">
            {details.question}
          </h3>
          <p className="text-muted-foreground text-xs">
            {statusText[details.status]}
          </p>
        </div>
      )}
      <div className="grid min-w-0 gap-5 min-[1250px]:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h4 className="text-muted-foreground text-sm font-medium">
            Before · Home card
          </h4>
          <LegacyOutput
            key={pair.before.id}
            placement={pair.before}
            context={context}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <h4 className="text-sm font-medium">After · Editable widget</h4>
          {pair.after.length > 1 && (
            <SelectInput
              aria-label="Replacement chart"
              placeholder="Choose a replacement"
              value={replacement.id}
              onValueChange={setVariant}
              options={pair.after.map((q) => ({
                value: q.id,
                label: q.config.title,
              }))}
            />
          )}
          <QueryOutput
            key={replacement.id}
            cell={replacement}
            context={context}
            onEdit={onEdit}
          />
        </div>
      </div>
      {details && (
        <div className="border-border border-l-2 pl-4 text-sm leading-6">
          <p className="font-bold">What the Home card measures</p>
          <p>{details.before}</p>
          <p className="mt-3 font-bold">Build the replacement</p>
          <p>{details.recipe}</p>
          <p className="mt-3 font-bold">Migration decision</p>
          <p>{details.note}</p>
        </div>
      )}
    </section>
  );
}

export function ReportCells({
  cells,
  context,
  onEditChart,
  onEditNote,
  editingNoteId,
  noteEditor,
  selectedPreset,
  onSelectPreset,
}: {
  cells: ReportPlacement[];
  context: OutputContext;
  onEditChart?: (cell: ReportQuery) => void;
  onEditNote?: (cell: ReportNote) => void;
  editingNoteId?: string;
  noteEditor?: React.ReactNode;
  selectedPreset?: string;
  onSelectPreset: (id: string) => void;
}) {
  const pairs = cells.flatMap((before) => {
    if (before.type !== "preset") return [];
    const after = cells.filter(
      (q): q is ReportQuery =>
        q.type === "query" && q.compareWith === before.id,
    );
    return after.length ? [{ before, after }] : [];
  });
  const paired = new Set(
    pairs.flatMap((p) => [p.before.id, ...p.after.map((q) => q.id)]),
  );
  return (
    <div className="space-y-9">
      {cells.map((cell) => {
        if (cell.id === editingNoteId)
          return <div key={cell.id}>{noteEditor}</div>;
        if (cell.id === pairs[0]?.before.id)
          return (
            <ReportComparisons
              key={cell.id}
              pairs={pairs}
              context={context}
              onEdit={onEditChart}
              selected={selectedPreset}
              onSelect={onSelectPreset}
            />
          );
        if (paired.has(cell.id)) return null;
        if (cell.type === "query")
          return (
            <QueryOutput
              key={cell.id}
              cell={cell}
              context={context}
              onEdit={onEditChart}
            />
          );
        if (cell.type === "text")
          return (
            <ReportMarkdown
              key={cell.id}
              title={cell.title}
              content={cell.content}
              onEdit={onEditNote && (() => onEditNote(cell))}
            />
          );
        return (
          <LegacyOutput key={cell.id} placement={cell} context={context} />
        );
      })}
    </div>
  );
}
