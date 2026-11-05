import { Eye } from "@langfuse/icons";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";

export type MaskedExternalIdProps = {
  isLoading: boolean;
  onReveal: () => void;
};

export function MaskedExternalId({
  isLoading,
  onReveal,
}: MaskedExternalIdProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold">External ID</span>
      <div className="bg-surface-section flex items-center justify-between rounded-md px-4 py-1.5">
        <span className="font-mono text-xs">••••••••••••••••••••••••</span>
        <IconButton
          icon={Eye}
          label="Show external ID"
          size="sm"
          disabled={isLoading}
          onClick={onReveal}
        />
      </div>
      <p className="text-muted-foreground text-sm">
        Show the external ID to see the trust policy.
      </p>
    </div>
  );
}
