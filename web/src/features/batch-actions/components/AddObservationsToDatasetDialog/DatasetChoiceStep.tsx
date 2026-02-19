import { Database, Plus } from "lucide-react";
import type { DatasetChoiceStepProps } from "./types";

export function DatasetChoiceStep(props: DatasetChoiceStepProps) {
  const { onSelectMode } = props;

  return (
    <div className="grid grid-cols-2 gap-6 p-6">
      {/* Existing Dataset Card */}
      <button
        type="button"
        onClick={() => onSelectMode("select")}
        className="flex flex-col items-center rounded-lg border-2 p-8 text-center transition-all hover:border-tertiary hover:bg-accent"
      >
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <Database className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Existing Dataset</h3>
        <p className="text-sm text-muted-foreground">
          Add to a dataset that already exists
        </p>
      </button>

      {/* New Dataset Card */}
      <button
        type="button"
        onClick={() => onSelectMode("create")}
        className="flex flex-col items-center rounded-lg border-2 p-8 text-center transition-all hover:border-tertiary hover:bg-accent"
      >
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <Plus className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">New Dataset</h3>
        <p className="text-sm text-muted-foreground">
          Create a new dataset for these observations
        </p>
      </button>
    </div>
  );
}
