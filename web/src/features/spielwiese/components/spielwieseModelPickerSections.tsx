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
      className={cn(
        "h-8 justify-between rounded-[10px] px-2.5 text-[0.8125rem] shadow-none",
        isActive
          ? "text-foreground bg-white ring-1 ring-black/6 hover:bg-white"
          : "text-foreground hover:bg-black/[0.03]",
      )}
      size="sm"
      type="button"
      variant="ghost"
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
      <ChevronRight
        aria-hidden="true"
        className="text-foreground/28 size-3 shrink-0 stroke-[2.2px]"
      />
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
        "focus-visible:ring-ring/30 flex w-full items-center justify-between gap-3 rounded-[12px] px-2.5 py-2.5 text-left outline-none focus-visible:ring-2",
        isActive
          ? "bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] ring-1 ring-black/5"
          : "hover:bg-white/72",
      )}
      onClick={onSelect}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      onMouseMove={onFocus}
      onPointerEnter={onFocus}
      onPointerMove={onFocus}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <SpielwieseModelProviderMark providerId={provider.id} />
        <p className="truncate text-[0.8125rem] leading-5 font-medium">
          {model.label}
        </p>
      </div>
      <ChevronRight className="text-foreground/28 size-3 shrink-0 stroke-[2.2px]" />
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
    <div className="flex min-h-0 w-[15rem] flex-col gap-1.5">
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
          className="text-foreground/64 hover:text-foreground mt-2 justify-start rounded-[10px] px-2.5 text-[0.75rem] hover:bg-black/[0.03]"
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
    <div className="flex w-[14rem] flex-col gap-3 rounded-[14px] border border-[rgba(0,0,0,0.05)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(243,244,241,0.92)_100%)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="flex flex-col gap-1.5">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Model profile
        </p>
        <p className="text-sm font-semibold">{model.label}</p>
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-black/5 bg-white/76 px-2.5 py-2 text-sm">
          <span className="text-muted-foreground">Token cost</span>
          <span className="font-medium tabular-nums">
            {getTokenCostLabel(model)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 rounded-[10px] border border-black/5 bg-white/58 p-2.5">
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
    <div className="flex w-[11rem] flex-col gap-3">
      <div className="px-0.5">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Providers
        </p>
      </div>
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
        <Button
          className="text-foreground/64 hover:text-foreground h-7 rounded-full border border-black/6 bg-white/76 px-3 text-[0.75rem] shadow-none hover:bg-white"
          size="sm"
          type="button"
          variant="ghost"
        >
          Recommend me a model
        </Button>
      </div>
    </div>
  );
}
