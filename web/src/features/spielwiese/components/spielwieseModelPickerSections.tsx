"use client";

import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import { spielwieseHeaderButtonBaseClassName } from "./spielwieseHeaderButtonStyles";
import {
  getCanonicalModelLabel,
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

const spielwieseModelRecommendButtonClassName =
  "border-border/40 bg-background/88 text-foreground/76 hover:bg-background hover:text-foreground hover:border-border/60 h-8 w-full justify-start rounded-[10px] px-2.5 text-[0.8125rem] shadow-[inset_0_1px_0_hsl(var(--background)/0.96),0_1px_2px_rgba(15,23,42,0.04)] transition-[background-color,border-color,color,box-shadow] outline-none focus-visible:ring-0 active:bg-background";

function ProviderButton({
  isActive,
  onClick,
  provider,
}: {
  isActive: boolean;
  onClick: () => void;
  provider: SpielwieseModelProvider;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        "text-foreground/76 flex w-full items-start gap-2 rounded-[10px] px-2 py-2 text-left transition-[background-color,box-shadow,color] outline-none",
        isActive
          ? "text-foreground bg-black/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
          : "text-foreground hover:bg-black/[0.025]",
      )}
      data-state={isActive ? "active" : "inactive"}
      type="button"
      onClick={onClick}
    >
      <span className="text-foreground/62 grid size-6 shrink-0 place-items-center rounded-[7px] border border-[rgba(0,0,0,0.08)] bg-[#F1F2F1]">
        <SpielwieseModelProviderMark providerId={provider.id} />
      </span>
      <span className="min-w-0 truncate pt-0.5 text-[0.8125rem] leading-4.5 font-medium">
        {provider.label}
      </span>
    </button>
  );
}

function ModelButton({
  description,
  isActive,
  label,
  onHover,
  onSelect,
  providerId,
}: {
  description: string;
  isActive: boolean;
  label: string;
  onHover: () => void;
  onSelect: () => void;
  providerId: SpielwieseModelProvider["id"];
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        "text-foreground/76 focus-visible:ring-ring/30 flex w-full items-start gap-2 rounded-[10px] border border-transparent px-2 py-2 text-left transition-[background-color,border-color,box-shadow,color] outline-none focus-visible:ring-2",
        isActive
          ? "text-foreground border-black/8 bg-black/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
          : "text-foreground hover:border-black/6 hover:bg-black/[0.025]",
      )}
      data-state={isActive ? "active" : "inactive"}
      type="button"
      onClick={onSelect}
      onFocus={onHover}
      onMouseEnter={onHover}
      onPointerEnter={onHover}
    >
      <span className="text-foreground/62 mt-0.5 grid size-6 shrink-0 place-items-center rounded-[7px] border border-[rgba(0,0,0,0.08)] bg-[#F1F2F1]">
        <SpielwieseModelProviderMark providerId={providerId} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.8125rem] leading-4.5 font-medium">
          {label}
        </span>
        <span className="text-foreground/56 line-clamp-1 text-[0.6875rem] leading-4">
          {description}
        </span>
      </span>
    </button>
  );
}

export function SpielwieseProviderColumn({
  currentProviderId,
  onSelectProvider,
}: {
  currentProviderId: string | null;
  onSelectProvider: (providerId: string) => void;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-1.5">
      <div className="flex flex-1 flex-col gap-1">
        {spielwieseModelProviders.map((provider) => (
          <ProviderButton
            isActive={provider.id === currentProviderId}
            key={provider.id}
            onClick={() => onSelectProvider(provider.id)}
            provider={provider}
          />
        ))}
      </div>
      <div className="mt-auto border-t border-black/6 pt-2">
        <Button
          className={cn(
            spielwieseHeaderButtonBaseClassName,
            spielwieseModelRecommendButtonClassName,
          )}
          size="sm"
          type="button"
          variant="ghost"
        >
          Recommend model
        </Button>
      </div>
    </div>
  );
}

export function SpielwieseModelColumn({
  currentModel,
  models,
  onHoverModel,
  onSelectModel,
  providerId,
}: {
  currentModel: string;
  models: SpielwieseModelOption[];
  onHoverModel: (modelLabel: string | null) => void;
  onSelectModel: (modelLabel: string) => void;
  providerId: SpielwieseModelProvider["id"];
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-1">
      <div className="flex flex-1 flex-col gap-1">
        {models.map((model) => (
          <ModelButton
            description={model.description}
            isActive={getCanonicalModelLabel(currentModel) === model.label}
            key={model.id}
            label={model.label}
            onHover={() => onHoverModel(model.label)}
            onSelect={() => onSelectModel(model.label)}
            providerId={providerId}
          />
        ))}
      </div>
    </div>
  );
}
