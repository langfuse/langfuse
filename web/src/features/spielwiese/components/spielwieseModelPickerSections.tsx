"use client";

import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  getCanonicalModelLabel,
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
        "h-8 justify-start rounded-[10px] px-2.5 text-[0.8125rem] shadow-none",
        isActive
          ? "text-foreground bg-white ring-1 ring-black/6 hover:bg-white"
          : "text-foreground hover:bg-black/[0.025]",
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
        <p className="truncate">{provider.label}</p>
      </span>
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
        "focus-visible:ring-ring/30 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left outline-none focus-visible:ring-2",
        isActive
          ? "bg-[#F6F7F4] ring-1 ring-black/6"
          : "hover:bg-black/[0.025]",
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
  const canonicalCurrentModel = getCanonicalModelLabel(currentModel);
  const models = showLegacyModels
    ? [...provider.latestModels, ...provider.legacyModels]
    : provider.latestModels;

  return (
    <div className="flex min-h-0 w-[13.75rem] flex-col gap-2">
      <div className="px-0.5 pt-0.5">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Models
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {models.map((model) => (
          <ModelOptionButton
            isActive={
              hoveredModelLabel === model.label ||
              canonicalCurrentModel === model.label
            }
            key={model.id}
            model={model}
            onFocus={() => onHoverModel(model.label)}
            onSelect={() => onSelectModel(model.label)}
            provider={provider}
          />
        ))}
      </div>
      {provider.legacyModels.length > 0 ? (
        <div className="border-t border-black/6 pt-2">
          <Button
            className="text-foreground/54 hover:text-foreground h-7 justify-start rounded-[8px] px-2 text-[0.75rem] hover:bg-black/[0.03]"
            size="sm"
            type="button"
            variant="ghost"
            onClick={toggleLegacyModels}
          >
            {showLegacyModels ? "Hide older models" : "More models"}
          </Button>
        </div>
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
    <div className="flex w-[12.5rem] flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Model profile
        </p>
        <p className="text-[0.9375rem] font-semibold">{model.label}</p>
      </div>
      <div className="divide-y divide-black/6 overflow-hidden rounded-[10px] border border-black/6 bg-white/72">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <p className="text-muted-foreground text-sm">Token cost</p>
          <p className="text-sm font-medium tabular-nums">
            {getTokenCostLabel(model)}
          </p>
        </div>
        {model.benchmarks.map((benchmark) => (
          <div
            className="flex items-center justify-between gap-3 px-3 py-2.5"
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
    <div className="flex w-[10.5rem] flex-1 flex-col gap-2">
      <div className="px-0.5 pt-0.5">
        <p className="text-foreground/42 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
          Providers
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
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
      <div className="mt-auto border-t border-black/6 pt-2">
        <Button
          className="text-foreground/54 hover:text-foreground h-7 justify-start rounded-[8px] px-2 text-[0.75rem] shadow-none hover:bg-black/[0.03]"
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
