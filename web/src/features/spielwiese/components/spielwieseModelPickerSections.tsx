"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

function ProviderButton({
  isActive,
  provider,
  onFocus,
  onClick,
}: {
  isActive: boolean;
  provider: SpielwieseModelProvider;
  onFocus: () => void;
  onClick: () => void;
}) {
  return (
    <Button
      className="justify-between rounded-lg"
      size="sm"
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      onFocus={onFocus}
      onClick={onClick}
      onMouseEnter={onFocus}
      onMouseMove={onFocus}
      onPointerEnter={onFocus}
      onPointerMove={onFocus}
    >
      <span className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark providerId={provider.id} />
        <span className="truncate">{provider.label}</span>
      </span>
      <ChevronRight data-icon="inline-end" />
    </Button>
  );
}

function BenchmarkDots({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1">
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

function getTokenCostLabel(model: SpielwieseModelOption) {
  const costScore = model.benchmarks.find(
    (benchmark) => benchmark.label === "Cost",
  )?.score;

  switch (costScore) {
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

function ModelOptionButton({
  isActive,
  model,
  onFocus,
  onSelect,
  provider,
}: {
  isActive: boolean;
  model: SpielwieseModelOption;
  onFocus: () => void;
  onSelect: () => void;
  provider: SpielwieseModelProvider;
}) {
  return (
    <button
      aria-label={model.label}
      className={cn(
        "hover:bg-accent/60 focus-visible:ring-ring/40 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2",
        isActive && "bg-accent/80",
      )}
      onClick={onSelect}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      onMouseMove={onFocus}
      onPointerEnter={onFocus}
      onPointerMove={onFocus}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark providerId={provider.id} />
        <p className="truncate text-sm font-medium">{model.label}</p>
      </div>
      <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
    </button>
  );
}

export function SpielwieseModelColumn({
  currentModel,
  hoveredModelLabel,
  onHoverModel,
  onSelectModel,
  provider,
  showLegacyModels,
  toggleLegacyModels,
}: {
  currentModel: string;
  hoveredModelLabel: string | null;
  onHoverModel: (modelLabel: string) => void;
  onSelectModel: (modelLabel: string) => void;
  provider: SpielwieseModelProvider;
  showLegacyModels: boolean;
  toggleLegacyModels: () => void;
}) {
  const models = showLegacyModels
    ? [...provider.latestModels, ...provider.legacyModels]
    : provider.latestModels;

  return (
    <div className="flex min-h-0 w-[15rem] flex-col gap-1">
      {models.map((model) => (
        <ModelOptionButton
          isActive={
            hoveredModelLabel === model.label || currentModel === model.label
          }
          key={model.id}
          model={model}
          onFocus={() => onHoverModel(model.label)}
          onSelect={() => onSelectModel(model.label)}
          provider={provider}
        />
      ))}
      {provider.legacyModels.length > 0 ? (
        <Button
          className="mt-1 justify-start rounded-lg"
          size="sm"
          type="button"
          variant="ghost"
          onClick={toggleLegacyModels}
        >
          {showLegacyModels ? "Hide older models" : "More models"}
        </Button>
      ) : null}
    </div>
  );
}

export function SpielwieseBenchmarkPreview({
  model,
}: {
  model: SpielwieseModelOption;
}) {
  return (
    <div className="bg-muted/25 flex w-[14rem] flex-col gap-3 rounded-xl p-3">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{model.label}</p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Token cost</span>
          <span className="font-medium">{getTokenCostLabel(model)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {model.benchmarks.map((benchmark) => (
          <div
            className="flex items-center justify-between gap-3"
            key={benchmark.label}
          >
            <p className="text-muted-foreground text-sm">{benchmark.label}</p>
            <BenchmarkDots score={benchmark.score} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpielwieseProviderColumn({
  currentProviderId,
  onSelectProvider,
}: {
  currentProviderId: string | null;
  onSelectProvider: (provider: SpielwieseModelProvider) => void;
}) {
  return (
    <div className="flex w-[11rem] flex-col gap-2">
      <div className="flex flex-1 flex-col gap-1">
        {spielwieseModelProviders.map((provider) => (
          <ProviderButton
            isActive={provider.id === currentProviderId}
            key={provider.id}
            onFocus={() => onSelectProvider(provider)}
            onClick={() => onSelectProvider(provider)}
            provider={provider}
          />
        ))}
      </div>
      <div className="flex justify-center">
        <Button size="sm" type="button" variant="secondary">
          Recommend me a model
        </Button>
      </div>
    </div>
  );
}
