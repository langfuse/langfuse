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
    <div className="-translate-y-2">
      <ActionButton
        hasAccess={hasWriteAccess}
        icon={<Plus className="h-4 w-4" />}
        onClick={onStartFromTemplate}
      >
        New evaluator
      </ActionButton>
    </div>
  );
}
