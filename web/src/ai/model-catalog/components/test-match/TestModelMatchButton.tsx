import { useState } from "react";
import { ActionButton } from "@/src/app/components/ActionButton";
import { TestModelMatchDialog } from "./TestModelMatchDialog";
import { FlaskConical } from "lucide-react";
import { type ButtonProps } from "@/src/app/design-system/legacy-primitives/button";

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
        icon={<FlaskConical className="icon-base" />}
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
