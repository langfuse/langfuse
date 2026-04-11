import { Play, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";

function SimulationActionButtons() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button size="sm" type="button" variant="outline">
        <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
        Reset sample
      </Button>
      <Button size="sm" type="button">
        <Play aria-hidden="true" className="size-3.5 shrink-0" />
        Run simulation
      </Button>
    </div>
  );
}

export function SpielwiesePromptSimulationPane() {
  return (
    <div
      className="border-border/70 bg-card/95 flex h-full min-h-0 flex-col overflow-hidden rounded-none border-x border-t-0 border-b px-4 py-4 shadow-xs sm:px-5 sm:py-5"
      data-testid="spielwiese-prompt-simulation-pane"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium">
          Playground
        </p>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <SimulationActionButtons />
      </div>
    </div>
  );
}
