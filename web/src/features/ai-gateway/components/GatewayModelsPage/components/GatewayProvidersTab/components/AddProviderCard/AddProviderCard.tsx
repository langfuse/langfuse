import { Plus } from "@langfuse/icons";

import { formatAvailableGatewayProviderNames } from "@/src/features/ai-gateway/fns/formatAvailableGatewayProviderNames";

export type AddProviderCardProps = {
  onAdd: () => void;
};

export function AddProviderCard({ onAdd }: AddProviderCardProps) {
  const providerNames = formatAvailableGatewayProviderNames();

  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:ring-ring flex min-h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-4 text-center transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
    >
      <Plus size="base" color="inherit" aria-hidden />
      <span className="text-foreground text-sm">Add connection</span>
      <span className="text-xs">{providerNames}</span>
    </button>
  );
}
