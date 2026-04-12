"use client";

import type {
  SpielwieseModelOption,
  SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseBenchmarkTable } from "./spielwieseModelPickerBenchmarkTable";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

function PickerSectionLabel({ children }: { children: string }) {
  return (
    <p className="text-foreground/42 px-0.5 pt-0.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

function BenchmarkHeader({
  model,
  provider,
}: {
  model: SpielwieseModelOption;
  provider: SpielwieseModelProvider | null;
}) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-black/6 bg-white/74 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)]">
      <span className="text-foreground/62 mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F1F2F1]">
        <SpielwieseModelProviderMark providerId={provider?.id} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[0.8125rem] leading-5 font-semibold">
          {model.label}
        </p>
        <p className="text-foreground/54 text-[0.6875rem] leading-4">
          {provider?.label}
        </p>
        <p className="text-foreground/58 mt-1 text-[0.6875rem] leading-4">
          {model.notes}
        </p>
      </div>
    </div>
  );
}

function BenchmarkEmptyState() {
  return (
    <div
      className="flex h-full w-full flex-col gap-2"
      data-testid="spielwiese-model-picker-benchmark-preview"
    >
      <PickerSectionLabel>Benchmarks</PickerSectionLabel>
      <div className="flex flex-1 items-center justify-center rounded-[12px] border border-dashed border-black/8 bg-black/[0.015] px-3 text-center">
        <p className="text-foreground/52 text-[0.75rem] leading-5">
          Hover a model to inspect benchmarks.
        </p>
      </div>
    </div>
  );
}

export function SpielwieseBenchmarkPreview({
  model,
  selectedProvider,
}: {
  model: SpielwieseModelOption | null;
  selectedProvider: SpielwieseModelProvider | null;
}) {
  if (!model) {
    return <BenchmarkEmptyState />;
  }

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col gap-2"
      data-testid="spielwiese-model-picker-benchmark-preview"
    >
      <PickerSectionLabel>Benchmarks</PickerSectionLabel>
      <BenchmarkHeader model={model} provider={selectedProvider} />
      <SpielwieseBenchmarkTable model={model} />
    </div>
  );
}
