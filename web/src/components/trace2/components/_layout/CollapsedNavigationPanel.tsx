/**
 * CollapsedNavigationPanel - Minimal UI shown when navigation panel is collapsed
 *
 * Purpose:
 * - Show clear affordance for expanding the panel
 * - Minimal width to maximize preview panel space
 * - Vertical text to indicate "Navigation"
 *
 * Performance: Avoids rendering full NavigationPanel content when collapsed
 */

import { Button } from "@/src/components/ui/button";
import { PanelLeftOpen } from "lucide-react";

interface CollapsedNavigationPanelProps {
  onExpand: () => void;
}

export function CollapsedNavigationPanel({
  onExpand,
}: CollapsedNavigationPanelProps) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 border-r bg-background p-2">
      {/* Vertical "Navigation" text */}
      <div className="flex flex-col items-center">
        <span
          className="text-sm font-medium text-muted-foreground"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Navigation
        </span>
      </div>

      {/* Expand button */}
      <Button
        onClick={onExpand}
        variant="ghost"
        size="icon"
        title="Expand navigation panel"
        className="h-8 w-8"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </Button>
    </div>
  );
}
