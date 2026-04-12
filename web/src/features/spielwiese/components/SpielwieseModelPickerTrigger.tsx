"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { getModelDisplayLabel } from "./spielwieseModelCatalog";
import { SpielwieseModelProviderMark } from "./SpielwieseModelProviderMark";

function RowModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <Button
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className="border-border/40 bg-background/88 hover:bg-background h-8 min-w-[11rem] justify-between rounded-lg border px-3 text-[0.8125rem] font-medium shadow-[inset_0_1px_0_hsl(var(--background)/0.96)]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark currentModel={currentModel} />
        <span className="min-w-0 truncate">{displayModelLabel}</span>
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

function EmbeddedModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <Button
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className="hover:bg-background h-7 min-w-[8.75rem] justify-between gap-2 rounded-none border-0 bg-transparent px-2.5 text-[13px]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-2">
        <SpielwieseModelProviderMark currentModel={currentModel} />
        <span className="min-w-0 truncate font-medium">
          {displayModelLabel}
        </span>
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

function DefaultModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
}) {
  const displayModelLabel = getModelDisplayLabel(currentModel);

  return (
    <Button
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      className="bg-background hover:bg-background h-7 min-w-[11rem] justify-between overflow-hidden rounded-[8px] border border-[rgba(0,0,0,0.08)] px-0 text-[13px]"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onClick}
    >
      <span className="text-foreground/58 grid h-full w-6 shrink-0 place-items-center border-r border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.02)]">
        <SpielwieseModelProviderMark currentModel={currentModel} />
      </span>
      <span className="min-w-0 flex-1 truncate px-2 font-medium">
        {displayModelLabel}
      </span>
      <ChevronDown data-icon="inline-end" />
    </Button>
  );
}

export function SpielwieseModelPickerTrigger({
  ariaLabel,
  currentModel,
  isOpen,
  onClick,
  variant = "default",
}: {
  ariaLabel: string;
  currentModel: string;
  isOpen: boolean;
  onClick: () => void;
  variant?: "default" | "embedded" | "row";
}) {
  if (variant === "row") {
    return (
      <RowModelPickerTrigger
        ariaLabel={ariaLabel}
        currentModel={currentModel}
        isOpen={isOpen}
        onClick={onClick}
      />
    );
  }

  if (variant === "embedded") {
    return (
      <EmbeddedModelPickerTrigger
        ariaLabel={ariaLabel}
        currentModel={currentModel}
        isOpen={isOpen}
        onClick={onClick}
      />
    );
  }

  return (
    <DefaultModelPickerTrigger
      ariaLabel={ariaLabel}
      currentModel={currentModel}
      isOpen={isOpen}
      onClick={onClick}
    />
  );
}
