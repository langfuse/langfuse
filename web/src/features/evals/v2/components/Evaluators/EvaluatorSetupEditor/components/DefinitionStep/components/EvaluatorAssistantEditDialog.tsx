import {
  type KeyboardEvent,
  type RefObject,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Textarea } from "@/src/components/ui/textarea";

const MAX_TEXTAREA_HEIGHT_PX = 240;

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
}

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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="lg"
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
          <DialogHeader>
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
            <Textarea
              aria-label={`Describe how to change this ${evaluatorLabel}`}
              autoFocus
              autoComplete="off"
              maxLength={2000}
              rows={4}
              placeholder={
                evaluatorType === "code"
                  ? "Also fail when the output is empty"
                  : "Score 1–5 instead of true or false"
              }
              value={request}
              disabled={isSubmitting}
              onChange={(event) => {
                setRequest(event.target.value);
                resizeTextarea(event.currentTarget);
              }}
              onKeyDown={handleKeyDown}
              className="max-h-60 min-h-24 resize-none"
            />
          </DialogBody>
          <DialogFooter className="px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!request.trim()}
              loading={isSubmitting}
            >
              Open Assistant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
