import { WandSparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";

export function EvaluatorAssistantActionButton({
  label,
  disabled,
  onClick,
}: {
  label: "Create with AI" | "Edit with AI";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      className="w-full gap-1.5 sm:w-auto"
      onClick={onClick}
    >
      <WandSparkles className="icon-base" aria-hidden="true" />
      {label}
    </Button>
  );
}
