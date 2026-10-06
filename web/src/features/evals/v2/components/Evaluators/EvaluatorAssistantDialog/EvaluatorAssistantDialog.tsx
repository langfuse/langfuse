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

const CREATE_EXAMPLES = [
  "Fail when the answer contradicts the retrieved context",
  "Check the answer only uses facts from the retrieved documents",
  "Score helpfulness 1–5 with a one-sentence reason",
];

const EDIT_EXAMPLES = [
  "Make the evaluation criterion stricter",
  "Change the score to a 1–5 scale",
  "Add a short explanation for every score",
];

const EDIT_PLACEHOLDERS = {
  code: "Also fail when the output is empty",
  judge: "Score 1–5 instead of true or false",
} as const;

export function EvaluatorAssistantDialog({
  open,
  mode,
  evaluatorType,
  returnFocusRef,
  onOpenChange,
  onAssistantSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  evaluatorType: "code" | "judge";
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onAssistantSubmit: (request: string) => Promise<boolean>;
}) {
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const evaluatorLabel =
    evaluatorType === "code" ? "code evaluator" : "LLM-as-a-judge evaluator";
  const examples = mode === "create" ? CREATE_EXAMPLES : EDIT_EXAMPLES;
  const placeholder =
    mode === "create"
      ? "Classify each user message into one topic: support, billing, technical, sales, feedback"
      : EDIT_PLACEHOLDERS[evaluatorType];

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
        size="lg"
        closeOnInteractionOutside={!isSubmitting}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef.current) {
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
              <Sparkles
                className="text-primary-accent h-4 w-4"
                aria-hidden="true"
              />
              {mode === "create" ? "Create with AI" : "Edit with AI"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? `Describe what this ${evaluatorLabel} should check. You can review and refine the result in the Assistant panel.`
                : `Describe how the Assistant should change this ${evaluatorLabel}. You can review and approve its update in the Assistant panel.`}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <EvaluatorAssistantComposer
              ariaLabel={
                mode === "create"
                  ? `Describe the ${evaluatorLabel} you want`
                  : `Describe how to change this ${evaluatorLabel}`
              }
              value={request}
              placeholder={placeholder}
              submitLabel={
                mode === "create"
                  ? "Create evaluator with AI"
                  : "Edit evaluator with AI"
              }
              isSubmitting={isSubmitting}
              autoFocus
              onValueChange={setRequest}
            />
            <section
              aria-labelledby={`evaluator-${mode}-example-prompts`}
              className="flex flex-col gap-2"
            >
              <p
                id={`evaluator-${mode}-example-prompts`}
                className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase"
              >
                Try one of these
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={isSubmitting}
                    className="border-border bg-card text-card-foreground hover:bg-accent focus-visible:ring-ring min-w-0 rounded-md border px-3 py-2 text-left text-sm text-wrap transition-colors focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setRequest(example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>
          </DialogBody>
        </form>
      </DialogContent>
    </Dialog>
  );
}
