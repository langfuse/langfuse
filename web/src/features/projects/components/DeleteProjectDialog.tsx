import { type ReactNode, useState } from "react";
import { ExternalLink } from "lucide-react";

import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

type DeleteProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
} & (
  | {
      blocked: true;
      onOpenGatewaySettings: () => void;
    }
  | {
      blocked?: false;
      confirmMessage: string;
      isPending: boolean;
      onSubmit: () => void;
    }
);

export function DeleteProjectDialog(props: DeleteProjectDialogProps) {
  const [confirmation, setConfirmation] = useState("");

  if (props.blocked) {
    return (
      <ConfirmDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        trigger={props.trigger}
        title="Project cannot be deleted"
        description="This project is used as the AI Gateway ingestion project. Select another ingestion project before deleting it."
        confirmLabel={
          <>
            Open AI Gateway settings
            <ExternalLink className="relative -top-px ml-1.5 size-3.5 shrink-0" />
          </>
        }
        confirmVariant="default"
        onConfirm={props.onOpenGatewaySettings}
      />
    );
  }

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open);
        if (!open) setConfirmation("");
      }}
      trigger={props.trigger}
      size="lg"
      title="Delete project"
      description="This action cannot be undone and removes all data associated with this project."
      confirmLabel="Delete project"
      confirmDisabled={confirmation !== props.confirmMessage}
      loading={props.isPending}
      onConfirm={props.onSubmit}
    >
      <div className="grid w-full gap-1.5">
        <Label htmlFor="delete-project-confirmation">
          Type &quot;{props.confirmMessage}&quot; to confirm deletion
        </Label>
        <Input
          id="delete-project-confirmation"
          placeholder={props.confirmMessage}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
