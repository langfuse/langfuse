import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function OverviewSelectionBar({
  selectedCount,
  onClear,
  children,
}: {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center">
      <div className="bg-background pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg ring-2 ring-black/10 backdrop-blur-md dark:ring-white/10">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="bg-border h-5 w-px" />
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </div>
  );
}
