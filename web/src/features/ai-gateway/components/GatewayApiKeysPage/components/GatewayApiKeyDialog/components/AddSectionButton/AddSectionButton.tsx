import { Plus } from "@langfuse/icons";

type AddSectionButtonProps = {
  label: string;
  /** Disables the button and explains why on hover. */
  disabledReason?: string;
  onAdd: () => void;
};

/** A dashed ghost button that adds an optional section to the key form. */
export function AddSectionButton({
  label,
  disabledReason,
  onAdd,
}: AddSectionButtonProps) {
  return (
    <span title={disabledReason}>
      <button
        type="button"
        onClick={onAdd}
        disabled={disabledReason !== undefined}
        className="border-border-contrast text-muted-foreground ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus size="base" aria-hidden />
        {label}
      </button>
    </span>
  );
}
