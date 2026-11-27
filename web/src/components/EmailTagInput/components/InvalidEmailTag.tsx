import { X } from "@langfuse/icons";

import { TagShell } from "@/src/components/design-system/Tag/Tag";

type InvalidEmailTagProps = {
  text: string;
  onEdit: () => void;
  onRemove: () => void;
  disabled?: boolean;
};

/** A chip for an entry that is not an email address: press it to edit the text, or remove it. */
export function InvalidEmailTag({
  text,
  onEdit,
  onRemove,
  disabled,
}: InvalidEmailTagProps) {
  return (
    <TagShell status="error">
      <button
        type="button"
        aria-label={`Edit ${text}, not an email address`}
        title={text}
        className="min-w-0 truncate py-0.5"
        onClick={onEdit}
        disabled={disabled}
      >
        {text}
      </button>
      <button
        type="button"
        aria-label={`Remove ${text}`}
        className="text-foreground-tertiary hover:text-foreground -mr-0.5 flex shrink-0 items-center rounded-sm"
        onClick={onRemove}
        disabled={disabled}
      >
        <X size="sm" />
      </button>
    </TagShell>
  );
}
