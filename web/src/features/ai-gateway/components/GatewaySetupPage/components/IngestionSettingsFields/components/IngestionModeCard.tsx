import { Check } from "@langfuse/icons";
import type { GatewayIngestionMode } from "@langfuse/shared";

import type { GATEWAY_INGESTION_MODES } from "@/src/features/ai-gateway/constants/gatewayIngestionModes";
import { cn } from "@/src/utils/tailwind";

export type IngestionModeCardProps = {
  option: (typeof GATEWAY_INGESTION_MODES)[number];
  selected: boolean;
  onSelect: (mode: GatewayIngestionMode) => void;
};

export function IngestionModeCard({
  option,
  selected,
  onSelect,
}: IngestionModeCardProps) {
  const Icon = option.icon;

  function handleClick() {
    onSelect(option.value);
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={handleClick}
      className={cn(
        "bg-card hover:bg-muted/50 flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors",
        selected && "border-primary ring-primary ring-1",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Icon size="base" color="muted" />
        {selected ? <Check size="base" __rawClassName="text-primary" /> : null}
      </div>
      <div>
        <p className="text-sm font-bold">{option.title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {option.description}
        </p>
      </div>
    </button>
  );
}
