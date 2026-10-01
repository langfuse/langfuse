import { Button } from "@/src/components/ui/button";
import { type IoRenderMode } from "@/src/components/table/data-table-io-render-mode-switch";

const FORMAT_OPTIONS: Array<{ id: IoRenderMode; label: string }> = [
  { id: "json", label: "JSON" },
  { id: "text", label: "Formatted" },
];

/**
 * How an item's input and output are rendered in a cell, as a section of the
 * table's own "Table settings" popover.
 *
 * It sits there rather than with the layout and diff controls because of what
 * kind of setting it is: layout, diff mode and item visibility live in the URL
 * and travel with a shared link, while this — like the column set and the row
 * height it now sits beside — is a per-user preference in local storage that a
 * link does not carry.
 */
export const ExperimentFormatSetting = ({
  ioRenderMode,
  onIoRenderModeChange,
}: {
  ioRenderMode: IoRenderMode;
  onIoRenderModeChange: (mode: IoRenderMode) => void;
}) => (
  <div>
    <p className="text-muted-foreground px-1 pb-1 text-xs">Format</p>
    <div className="grid grid-cols-2 gap-1">
      {FORMAT_OPTIONS.map(({ id, label }) => (
        <Button
          key={id}
          variant={ioRenderMode === id ? "secondary" : "ghost"}
          aria-pressed={ioRenderMode === id}
          className="h-auto py-1.5"
          onClick={() => onIoRenderModeChange(id)}
        >
          <span className="text-xs">{label}</span>
        </Button>
      ))}
    </div>
  </div>
);
