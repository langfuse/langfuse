import { Button } from "@/src/components/ui/button";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useState } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { NewProjectForm } from "./NewProjectForm";

interface NewProjectButtonProps {
  orgId: string;
  inBreadcrumb?: boolean;
}
export function NewProjectButton({
  orgId,
  inBreadcrumb,
}: NewProjectButtonProps) {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (open) {
          capture("projects:new_form_open");
        }
        setOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={inBreadcrumb ? "ghost" : "secondary"}
          size={inBreadcrumb ? "xs" : undefined}
          data-testid="create-project-btn"
          className={
            inBreadcrumb ? "h-8 w-full text-sm font-normal" : undefined
          }
        >
          <PlusIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <NewProjectForm orgId={orgId} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
