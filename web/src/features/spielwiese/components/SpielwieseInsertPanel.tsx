import type { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Separator } from "../ui/separator";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type SpielwieseInsertPanelProps = {
  insertPanel: SpielwieseDashboardVM["insertPanel"];
};

type InsertItem = SpielwieseDashboardVM["insertPanel"]["items"][number];
type LinePreset = SpielwieseDashboardVM["insertPanel"]["linePresets"][number];
type InsertTable = SpielwieseDashboardVM["insertPanel"]["table"];

function LinePreview({ style }: Pick<LinePreset, "style">) {
  if (style === "dots") {
    return (
      <div className="flex items-center gap-1">
        <span className="bg-muted-foreground/65 size-1 rounded-full" />
        <span className="bg-muted-foreground/65 size-1 rounded-full" />
        <span className="bg-muted-foreground/65 size-1 rounded-full" />
      </div>
    );
  }

  if (style === "dash") {
    return (
      <div className="border-muted-foreground/65 w-full border-t border-dashed" />
    );
  }

  if (style === "split") {
    return (
      <div className="flex w-full items-center gap-2">
        <span className="border-muted-foreground/65 flex-1 border-t" />
        <span className="border-muted-foreground/65 flex-1 border-t" />
      </div>
    );
  }

  return <div className="bg-muted-foreground/65 h-px w-full" />;
}

function InsertItemButton({ item }: { item: InsertItem }) {
  const Icon = item.icon;

  return (
    <button
      className="hover:bg-accent/60 hover:text-accent-foreground focus-visible:ring-ring/40 flex h-9 items-center gap-2 rounded-md px-2 text-left transition-colors outline-none focus-visible:ring-2"
      type="button"
    >
      <span className="inline-flex size-5 shrink-0 items-center justify-center">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {item.label}
      </span>
      <GripVertical className="text-muted-foreground shrink-0" size={14} />
    </button>
  );
}

function InsertLineSection({ linePresets }: { linePresets: LinePreset[] }) {
  return (
    <div className="grid gap-2 @sm:grid-cols-2">
      {linePresets.map((preset) => (
        <button
          key={preset.id}
          aria-label={preset.label}
          className="hover:bg-accent/60 focus-visible:ring-ring/40 flex h-9 items-center justify-center rounded-md border border-dashed px-3 transition-colors outline-none focus-visible:ring-2"
          type="button"
        >
          <LinePreview style={preset.style} />
        </button>
      ))}
    </div>
  );
}

function InsertPageBreak({ label }: { label: string }) {
  return (
    <button
      aria-label={label}
      className="hover:bg-accent/60 focus-visible:ring-ring/40 flex min-h-12 items-center rounded-md border px-3 transition-colors outline-none focus-visible:ring-2"
      type="button"
    >
      <span className="bg-muted h-4 w-full rounded-sm" />
    </button>
  );
}

function InsertTableSection({ table }: { table: InsertTable }) {
  const { columns, footerLabel, helper, rows, selectedColumns, selectedRows } =
    table;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm text-pretty">{helper}</p>

      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          const isHighlighted = row < selectedRows && column < selectedColumns;

          return (
            <span
              key={`${row}-${column}`}
              className={cn(
                "bg-background size-6 rounded-sm border",
                isHighlighted && "bg-accent border-accent",
              )}
            />
          );
        })}
      </div>

      <div className="flex justify-end">
        <div className="bg-background inline-flex items-center gap-2 rounded-full border px-3 py-1.5">
          <span className="bg-primary size-2.5 rounded-full" />
          <span className="text-sm font-medium">{footerLabel}</span>
        </div>
      </div>
    </div>
  );
}

function InsertSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-foreground text-sm font-medium">{title}</p>
      {children}
    </section>
  );
}

export function SpielwieseInsertPanel({
  insertPanel,
}: SpielwieseInsertPanelProps) {
  return (
    <section
      className="@container flex flex-col gap-5"
      data-testid="spielwiese-insert-panel"
    >
      <div className="px-2 pt-1">
        <p className="text-muted-foreground text-sm text-pretty">
          {insertPanel.description}
        </p>
      </div>

      <div className="flex flex-col gap-0.5">
        {insertPanel.items.map((item) => (
          <InsertItemButton item={item} key={item.id} />
        ))}
      </div>

      <Separator />

      <InsertSection title="Insert Line">
        <InsertLineSection linePresets={insertPanel.linePresets} />
      </InsertSection>

      <Separator />

      <InsertSection title="Insert Page Break">
        <InsertPageBreak label={insertPanel.pageBreakLabel} />
      </InsertSection>

      <Separator />

      <InsertSection title="Insert Table">
        <InsertTableSection table={insertPanel.table} />
      </InsertSection>
    </section>
  );
}
