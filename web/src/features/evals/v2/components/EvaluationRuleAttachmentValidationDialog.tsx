import { LoaderCircle } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";

export function EvaluationRuleAttachmentValidationDialog({
  open,
}: {
  open: boolean;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-sm"
        overlayMode="blocking"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogBody className="items-center gap-3 py-8 text-center">
          <LoaderCircle className="text-primary h-6 w-6 animate-spin" />
          <DialogTitle>Checking evaluator</DialogTitle>
          <DialogDescription>
            Code evaluators run once on a matching observation. LLM evaluators
            only check that their variable mappings are complete.
          </DialogDescription>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
