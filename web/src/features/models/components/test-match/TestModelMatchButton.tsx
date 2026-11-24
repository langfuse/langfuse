import { useState } from "react";
import { ActionButton } from "@/src/components/ActionButton";
import { TestModelMatchDialog } from "./TestModelMatchDialog";
import { FlaskConical } from "@langfuse/icons";
import { type ButtonProps } from "@/src/components/ui/button";
import { type ModelOwner } from "@/src/features/models/modelOwner";

type TestModelMatchButtonProps = {
  owner: ModelOwner;
  variant?: ButtonProps["variant"];
};

export type { TestModelMatchButtonProps };

export function TestModelMatchButton({
  owner,
  variant,
}: TestModelMatchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        variant={variant ?? "secondary"}
        icon={<FlaskConical size="base" />}
        onClick={() => setOpen(true)}
        data-testid="test-model-match-button"
      >
        Test Model Match
      </ActionButton>

      <TestModelMatchDialog owner={owner} open={open} onOpenChange={setOpen} />
    </>
  );
}
