import { useState } from "react";
import { ActionButton } from "@/src/components/ActionButton";
import { TestModelMatchDialog } from "./TestModelMatchDialog";
import { FlaskConical } from "lucide-react";

type TestModelMatchButtonProps = {
  projectId: string;
};

export type { TestModelMatchButtonProps };

export function TestModelMatchButton({ projectId }: TestModelMatchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        variant="secondary"
        icon={<FlaskConical className="h-4 w-4" />}
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
