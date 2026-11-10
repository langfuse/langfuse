import { Plus } from "@langfuse/icons";

import {
  gatewayProviders,
  providerLabels,
} from "@/src/features/ai-gateway/constants/providerLabels";

export type AddProviderCardProps = {
  onAdd: () => void;
};

export function AddProviderCard({ onAdd }: AddProviderCardProps) {
  const providerNames = new Intl.ListFormat("en", {
    type: "disjunction",
  }).format(gatewayProviders.map((provider) => providerLabels[provider]));

  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:ring-ring flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <Plus size="base" color="inherit" aria-hidden />
      <span className="text-foreground text-sm">Add provider</span>
      <span className="text-xs">{providerNames}</span>
    </button>
  );
}
