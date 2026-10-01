import { type RefObject, type SyntheticEvent, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { EvaluatorAssistantComposer } from "@/src/features/evals/v2/components/Evaluators/EvaluatorAssistantComposer/EvaluatorAssistantComposer";

export function EvaluatorAssistantEditDialog({
  open,
  evaluatorType,
  returnFocusRef,
  onOpenChange,
  onAssistantSubmit,
}: {
  open: boolean;
  evaluatorType: "code" | "judge";
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onAssistantSubmit: (request: string) => Promise<boolean>;
}) {
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const evaluatorLabel =
    evaluatorType === "code" ? "code evaluator" : "LLM-as-a-judge evaluator";

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting) return;
    if (!nextOpen) setRequest("");
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();
    if (!trimmedRequest || submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const started = await onAssistantSubmit(trimmedRequest);
      if (started) {
        setRequest("");
        onOpenChange(false);
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        closeOnInteractionOutside={!isSubmitting}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader className="[&>div]:items-start [&>div>button]:-mt-1">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-primary-accent h-4 w-4" />
              Edit with AI
            </DialogTitle>
            <DialogDescription>
              Describe how the Assistant should change this {evaluatorLabel}.
              You can review and approve its update in the Assistant panel.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <EvaluatorAssistantComposer
              ariaLabel={`Describe how to change this ${evaluatorLabel}`}
              value={request}
              placeholder={
                evaluatorType === "code"
                  ? "Also fail when the output is empty"
                  : "Score 1–5 instead of true or false"
              }
              submitLabel="Open Assistant"
              isSubmitting={isSubmitting}
              autoFocus
              onValueChange={setRequest}
            />
          </DialogBody>
        </form>
      </DialogContent>
    </Dialog>
  );
}
