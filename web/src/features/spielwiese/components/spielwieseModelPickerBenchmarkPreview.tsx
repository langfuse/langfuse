"use client";

import type { SpielwieseModelOption } from "./spielwieseModelCatalog";
import { SpielwieseBenchmarkTable } from "./spielwieseModelPickerBenchmarkTable";

export function SpielwieseBenchmarkPreview({
  model,
}: {
  model: SpielwieseModelOption | null;
}) {
  if (!model) {
    return null;
  }

  return (
    <div
      className="flex h-auto w-full min-w-0 flex-col"
      data-testid="spielwiese-model-picker-benchmark-preview"
    >
      <SpielwieseBenchmarkTable model={model} />
    </div>
  );
}
