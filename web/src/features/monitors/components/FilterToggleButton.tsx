import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { Button } from "@/src/components/ui/button";

/** FilterToggleButton shows / hides the table's sidebar filter panel. */
export function FilterToggleButton() {
  const { open, setOpen } = useDataTableControls();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(!open)}
      className="flex h-8 items-center gap-2 text-sm"
    >
      {open ? (
        <PanelLeftClose className="h-4 w-4" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" />
      )}
      <span>{open ? "Hide" : "Show"} filters</span>
    </Button>
  );
}
