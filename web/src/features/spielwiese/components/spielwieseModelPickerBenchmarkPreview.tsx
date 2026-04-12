"use client";

import { cn } from "@/src/utils/tailwind";
import type {
  SpielwieseModelOption,
  SpielwieseModelProvider,
  SpielwieseModelScore,
} from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

function getTokenCostLabel(score: SpielwieseModelScore | undefined) {
  switch (score) {
    case 5:
      return "Low";
    case 4:
      return "Moderate";
    case 3:
      return "Mid";
    case 2:
      return "High";
    default:
      return "Very high";
  }
}

function BenchmarkDots({ score }: { score: SpielwieseModelScore }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          className={cn(
            "bg-border size-1.5 rounded-full",
            index < score && "bg-foreground",
          )}
          key={index}
        />
      ))}
    </div>
  );
}

function BenchmarkPreviewEmptyState() {
  return (
    <div className="flex w-[13rem] flex-col gap-3">
      <p className="text-foreground/42 px-0.5 pt-0.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
        Benchmarks
      </p>
      <p className="text-foreground/54 text-sm">
        Pick a provider to inspect benchmark details.
      </p>
    </div>
  );
}

function BenchmarkPreviewHeader({
  currentModel,
  model,
  selectedProvider,
}: {
  currentModel: string;
  model: SpielwieseModelOption;
  selectedProvider: SpielwieseModelProvider | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-foreground/42 px-0.5 pt-0.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
        Benchmarks
      </p>
      <div className="flex items-start gap-2">
        <span className="text-foreground/62 mt-0.5 grid size-6 shrink-0 place-items-center rounded-[8px] border border-[rgba(0,0,0,0.06)] bg-white/80">
          <SpielwieseModelProviderMark providerId={selectedProvider?.id} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold">
            {model.label}
          </p>
          <p className="text-foreground/54 text-[0.75rem] leading-[1.1rem]">
            {selectedProvider?.label ?? currentModel}
          </p>
        </div>
      </div>
      <p className="text-foreground/58 text-[0.75rem] leading-[1.15rem]">
        {model.notes}
      </p>
    </div>
  );
}

function BenchmarkPreviewCards({ model }: { model: SpielwieseModelOption }) {
  const tokenCostScore = model.benchmarks.find(
    (benchmark) => benchmark.label === "Cost",
  )?.score;

  return (
    <>
      <div className="rounded-[10px] border border-black/6 bg-white/76">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-black/6 px-3 py-2.5">
          <p className="text-muted-foreground min-w-0 text-sm">Token cost</p>
          <p className="shrink-0 text-sm font-medium tabular-nums">
            {getTokenCostLabel(tokenCostScore)}
          </p>
        </div>
        {model.benchmarks.map((benchmark) => (
          <div
            className="flex min-w-0 items-center justify-between gap-3 border-b border-black/6 px-3 py-2.5 last:border-b-0"
            key={benchmark.label}
          >
            <p className="text-muted-foreground min-w-0 text-sm">
              {benchmark.label}
            </p>
            <BenchmarkDots score={benchmark.score} />
          </div>
        ))}
      </div>
      <div className="rounded-[10px] border border-black/6 bg-white/48 px-3 py-2.5">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.12em] uppercase">
          Best for
        </p>
        <p className="text-foreground/78 mt-1 text-sm">{model.bestFor}</p>
      </div>
    </>
  );
}

export function SpielwieseBenchmarkPreview({
  currentModel,
  model,
  selectedProvider,
}: {
  currentModel: string;
  model: SpielwieseModelOption | null;
  selectedProvider: SpielwieseModelProvider | null;
}) {
  if (!model) {
    return <BenchmarkPreviewEmptyState />;
  }

  return (
    <div
      className="flex w-[13rem] flex-col gap-3"
      data-testid="spielwiese-model-picker-benchmark-preview"
    >
      <BenchmarkPreviewHeader
        currentModel={currentModel}
        model={model}
        selectedProvider={selectedProvider}
      />
      <BenchmarkPreviewCards model={model} />
    </div>
  );
}
