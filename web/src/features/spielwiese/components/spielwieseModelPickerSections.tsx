"use client";

import { cn } from "@/src/utils/tailwind";
import { Button } from "../ui/button";
import {
  spielwieseHeaderButtonAccentClassName,
  spielwieseHeaderButtonBaseClassName,
} from "./spielwieseHeaderButtonStyles";
import {
  getCanonicalModelLabel,
  spielwieseModelProviders,
  type SpielwieseModelOption,
  type SpielwieseModelProvider,
} from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

function PickerSectionLabel({ children }: { children: string }) {
  return (
    <p className="text-foreground/42 px-0.5 pt-0.5 text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

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
        "flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-[background-color,box-shadow] outline-none",
        isActive
          ? "bg-black/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
          : "hover:bg-black/[0.025]",
      )}
      data-state={isActive ? "active" : "inactive"}
      type="button"
      onClick={onClick}
    >
      <span className="text-foreground/62 grid size-7 shrink-0 place-items-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F1F2F1]">
        <SpielwieseModelProviderMark providerId={provider.id} />
      </span>
      <span className="min-w-0 truncate pt-0.5 text-[0.8125rem] leading-5 font-medium">
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
        "focus-visible:ring-ring/30 flex w-full items-start gap-2.5 rounded-[10px] border border-transparent px-2.5 py-2.5 text-left transition-[background-color,border-color,box-shadow] outline-none focus-visible:ring-2",
        isActive
          ? "border-black/8 bg-black/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]"
          : "hover:border-black/6 hover:bg-black/[0.025]",
      )}
      data-state={isActive ? "active" : "inactive"}
      type="button"
      onClick={onSelect}
      onFocus={onHover}
      onMouseEnter={onHover}
      onPointerEnter={onHover}
    >
      <span className="text-foreground/62 mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#F1F2F1]">
        <SpielwieseModelProviderMark providerId={providerId} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.8125rem] leading-5 font-medium">
          {label}
        </span>
        <span className="text-foreground/56 line-clamp-2 text-[0.75rem] leading-[1.15rem]">
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
    <div className="flex h-full w-full min-w-0 flex-col gap-2">
      <PickerSectionLabel>Providers</PickerSectionLabel>
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
            spielwieseHeaderButtonAccentClassName,
            "h-8 w-full justify-start rounded-[10px] px-2.5 text-[0.8125rem] shadow-none",
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
  showLegacyModels,
  showOlderModelsButton,
  toggleLegacyModels,
}: {
  currentModel: string;
  models: SpielwieseModelOption[];
  onHoverModel: (modelLabel: string | null) => void;
  onSelectModel: (modelLabel: string) => void;
  providerId: SpielwieseModelProvider["id"];
  showLegacyModels: boolean;
  showOlderModelsButton: boolean;
  toggleLegacyModels: () => void;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col gap-2">
      <PickerSectionLabel>Models</PickerSectionLabel>
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
      {showOlderModelsButton ? (
        <div className="border-t border-black/6 pt-2">
          <Button
            className="text-foreground/54 hover:text-foreground h-7 justify-start rounded-[8px] px-2 text-[0.75rem] shadow-none hover:bg-black/[0.03]"
            data-testid="spielwiese-model-picker-older-toggle"
            size="sm"
            type="button"
            variant="ghost"
            onClick={toggleLegacyModels}
          >
            {showLegacyModels ? "Hide older models" : "Show older models"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
