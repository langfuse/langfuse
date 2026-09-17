import { useState } from "react";
import { ActionButton } from "@/src/components/ActionButton";
import { TestModelMatchDialog } from "./TestModelMatchDialog";
import { FlaskConical } from "lucide-react";
import { type ButtonProps } from "@/src/components/ui/button";

type TestModelMatchButtonProps = {
  projectId: string;
  variant?: ButtonProps["variant"];
};

export type { TestModelMatchButtonProps };

export function TestModelMatchButton({
  projectId,
  variant,
}: TestModelMatchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        variant={variant ?? "secondary"}
        icon={<FlaskConical className="icon-lg" />}
        onClick={() => setOpen(true)}
        data-testid="test-model-match-button"
      >
        Test Model Match
      </ActionButton>

      <TestModelMatchDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
