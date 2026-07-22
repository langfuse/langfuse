import { fn } from "storybook/test";
import {
  BarChart3,
  Bookmark,
  Columns3,
  Download,
  Filter,
  RefreshCw,
  Sparkles,
  Table,
} from "lucide-react";

import preview from "../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { OverflowActionBar, type OverflowAction } from "./OverflowActionBar";

const meta = preview.meta({
  component: OverflowActionBar,
});

/** A realistic Traces-page action set: date range, refresh, view toggle,
 *  filters (with a count), views, columns, export, and a pinned "Ask AI". */
const sampleActions = (): OverflowAction[] => {
  const barButton = (label: string, icon: React.ReactNode) => (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={fn()}>
      {icon}
      {label}
    </Button>
  );
  return [
    {
      key: "date",
      content: barButton("Past 1 day", null),
      overflowLabel: "Past 1 day",
      onSelect: fn(),
    },
    {
      key: "refresh",
      content: barButton("Off", <RefreshCw className="size-3.5" />),
      overflowLabel: (
        <>
          <RefreshCw className="size-4" /> Auto-refresh
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "view",
      content: barButton("Table", <Table className="size-3.5" />),
      overflowLabel: (
        <>
          <BarChart3 className="size-4" /> Chart view
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "filters",
      content: (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={fn()}>
          <Filter className="size-3.5" />
          Filters
          <span className="bg-primary text-primary-foreground ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none">
            2
          </span>
        </Button>
      ),
      overflowLabel: (
        <>
          <Filter className="size-4" /> Filters (2)
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "views",
      content: barButton("My Views", <Bookmark className="size-3.5" />),
      overflowLabel: (
        <>
          <Bookmark className="size-4" /> My Views
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "columns",
      content: barButton("Columns", <Columns3 className="size-3.5" />),
      overflowLabel: (
        <>
          <Columns3 className="size-4" /> Columns
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "export",
      content: barButton("Export", <Download className="size-3.5" />),
      overflowLabel: (
        <>
          <Download className="size-4" /> Export
        </>
      ),
      onSelect: fn(),
    },
    {
      key: "ask-ai",
      pinned: true,
      content: (
        <Button size="sm" className="gap-1.5" onClick={fn()}>
          <Sparkles className="size-3.5" />
          Ask AI
        </Button>
      ),
      overflowLabel: "Ask AI",
    },
  ];
};

// Wide enough that every action fits on one line — no overflow trigger.
export const Default = meta.story({
  args: { actions: sampleActions() },
  render: (args) => (
    <div className="w-[640px] max-w-full rounded-md border p-2">
      <OverflowActionBar {...args} />
    </div>
  ),
});

// Phone width: most actions spill into the "⋯" menu; the pinned "Ask AI" and
// the count badge stay put.
export const Overflowing = meta.story({
  args: { actions: sampleActions() },
  render: (args) => (
    <div className="w-[360px] max-w-full rounded-md border p-2">
      <OverflowActionBar {...args} />
    </div>
  ),
});

// The mechanic at a glance: the same bar at shrinking widths. As space drops,
// trailing actions move into "⋯ (n)"; "Ask AI" never leaves the row.
export const AcrossWidths = meta.story({
  args: { actions: sampleActions() },
  render: (args) => (
    <div className="flex flex-col gap-4">
      {[680, 520, 400, 300, 240].map((w) => (
        <div key={w} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{w}px</span>
          <div
            className="rounded-md border p-2"
            style={{ width: w, maxWidth: "100%" }}
          >
            <OverflowActionBar {...args} />
          </div>
        </div>
      ))}
    </div>
  ),
});
