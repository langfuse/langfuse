import { Plus } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";

export function EvaluatorCreateButton({
  hasWriteAccess,
  onStartFromTemplate,
}: {
  hasWriteAccess: boolean;
  onStartFromTemplate: () => void;
}) {
  return (
    <ActionButton
      hasAccess={hasWriteAccess}
      icon={<Plus className="h-4 w-4" />}
      className="-translate-y-2"
      onClick={onStartFromTemplate}
    >
      New evaluator
    </ActionButton>
  );
}
