import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";

type AddSectionButtonProps = {
  label: string;
  disabled?: boolean;
  onAdd: () => void;
};

/** Adds an optional section to the key form. */
export function AddSectionButton({
  label,
  disabled = false,
  onAdd,
}: AddSectionButtonProps) {
  return (
    <Button
      text={label}
      icon={Plus}
      variant="outline"
      disabled={disabled}
      onClick={onAdd}
    />
  );
}
