import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import { SendHorizontal, Sparkles, X } from "lucide-react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Textarea } from "@/src/components/ui/textarea";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import styles from "./CodeEvaluatorAssistantExperience.module.css";

const CODE_EVALUATOR_EDITOR_MODE_STORAGE_KEY =
  "langfuse:code-evaluator-editor-mode:v1";
const MAX_TEXTAREA_HEIGHT_PX = 160;

type EditorMode = "assistant" | "code";
export type CodeEvaluatorAssistantContext = "scratch" | "edit";
const STARTER_REQUESTS = [
  "Answer cites a retrieved document",
  "Output is valid JSON for this schema",
  "Tool call arguments are well formed",
] as const;

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
}

function AssistantComposer({
  context,
  presentation,
  onDismiss,
  onSubmitted,
  onSubmittingChange,
  onAssistantSubmit,
}: {
  context: CodeEvaluatorAssistantContext;
  presentation: "prominent" | "floating";
  onDismiss: () => void;
  onSubmitted: () => void;
  onSubmittingChange: (submitting: boolean) => void;
  onAssistantSubmit: (request: string) => Promise<boolean>;
}) {
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const isScratch = context === "scratch";

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();
    if (!trimmedRequest || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    onSubmittingChange(true);
    try {
      const started = await onAssistantSubmit(trimmedRequest);

      if (started) {
        setRequest("");
        onSubmitted();
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
      onSubmittingChange(false);
    }
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Escape" &&
      !event.nativeEvent.isComposing &&
      !isSubmitting &&
      presentation === "prominent"
    ) {
      event.preventDefault();
      onDismiss();
    }
  };

  const textarea = (
    <Textarea
      aria-label={
        isScratch
          ? "Describe the code evaluator you want"
          : "Describe how to change this code evaluator"
      }
      autoComplete="off"
      maxLength={2000}
      rows={presentation === "prominent" ? 3 : 1}
      placeholder={
        isScratch
          ? "Fail when the output does not exactly match the expected answer, ignoring case and trailing whitespace"
          : "Also fail when the output is empty"
      }
      value={request}
      disabled={isSubmitting}
      onChange={(event) => {
        setRequest(event.target.value);
        resizeTextarea(event.currentTarget);
      }}
      onKeyDown={handleTextareaKeyDown}
      className={cn(
        "max-h-40 min-w-0 resize-none",
        presentation === "prominent" ? "min-h-24" : "min-h-9 flex-1 py-2",
      )}
    />
  );

  if (presentation === "floating") {
    return (
      <form
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        className="bg-background flex w-full flex-wrap items-end gap-2 rounded-md border p-2 shadow-lg"
      >
        <Sparkles className="text-primary-accent mb-2 h-4 w-4 shrink-0" />
        {textarea}
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="shrink-0"
          aria-label="Update with Langfuse Assistant"
          disabled={!request.trim()}
          loading={isSubmitting}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0"
          aria-label="Dismiss AI editor"
          disabled={isSubmitting}
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className={cn(
        styles.bracketed,
        "border-border bg-background flex flex-col gap-3 border p-4",
      )}
    >
      <div className="text-primary-accent flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
        <Sparkles className="h-3.5 w-3.5" />
        Write it with AI
      </div>
      <h3 className="text-lg font-bold">
        Describe what this evaluator should check.
      </h3>
      {textarea}
      <div className="flex flex-wrap gap-1.5">
        {STARTER_REQUESTS.map((starter) => (
          <button
            key={starter}
            type="button"
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 min-h-6 rounded-md px-2.5 py-1 text-left text-xs whitespace-normal disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => setRequest(starter)}
          >
            {starter}
          </button>
        ))}
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t border-dashed pt-3">
        <Button
          type="button"
          variant="link"
          size="sm"
          disabled={isSubmitting}
          onClick={onDismiss}
        >
          Write it myself
        </Button>
        <Button
          type="submit"
          size="sm"
          aria-label="Create with Langfuse Assistant"
          disabled={!request.trim()}
          loading={isSubmitting}
        >
          Generate
          <SendHorizontal className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

export function CodeEvaluatorAssistantExperience({
  context,
  onAssistantSubmit,
  children,
}: {
  context: CodeEvaluatorAssistantContext | null;
  onAssistantSubmit: (request: string) => Promise<boolean>;
  children: (assistantAction: ReactNode) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const isAssistantLauncherVisible = useIsInAppAgentLauncherVisible();
  const [preferredScratchMode, setPreferredScratchMode] =
    useLocalStorage<EditorMode>(
      CODE_EVALUATOR_EDITOR_MODE_STORAGE_KEY,
      "assistant",
    );
  const [editMode, setEditMode] = useState<EditorMode>("code");
  const [isAssistantSubmitting, setIsAssistantSubmitting] = useState(false);
  const mode = context === "scratch" ? preferredScratchMode : editMode;

  if (!context || !isAssistantLauncherVisible) return children(null);

  const setMode = (nextMode: EditorMode) => {
    if (nextMode === mode) {
      return;
    }
    if (context === "scratch") setPreferredScratchMode(nextMode);
    else setEditMode(nextMode);

    capture("evaluators:code_editor_mode_switch", {
      context,
      mode: nextMode,
    });
  };

  if (context === "scratch" && mode === "assistant") {
    return (
      <AssistantComposer
        context={context}
        presentation="prominent"
        onDismiss={() => setMode("code")}
        onSubmitted={() => undefined}
        onSubmittingChange={setIsAssistantSubmitting}
        onAssistantSubmit={onAssistantSubmit}
      />
    );
  }

  const assistantAction = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isAssistantSubmitting}
      aria-expanded={context === "edit" && mode === "assistant"}
      onClick={context === "scratch" ? () => setMode("assistant") : undefined}
    >
      <Sparkles className="text-primary-accent mr-1.5 h-3.5 w-3.5" />
      {context === "edit" ? "Edit with AI" : "Write with AI"}
    </Button>
  );

  if (context === "edit") {
    return (
      <Popover
        open={mode === "assistant"}
        onOpenChange={(open) => {
          if (!open && isAssistantSubmitting) {
            return;
          }
          setMode(open ? "assistant" : "code");
        }}
      >
        <div className="relative">
          {children(<PopoverTrigger asChild>{assistantAction}</PopoverTrigger>)}
        </div>
        <PopoverContent
          align="end"
          className="w-[min(28rem,calc(100vw-2rem))] border-0 bg-transparent p-0 shadow-none"
          onEscapeKeyDown={(event) => {
            if (isAssistantSubmitting) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isAssistantSubmitting) {
              event.preventDefault();
            }
          }}
        >
          <AssistantComposer
            context={context}
            presentation="floating"
            onDismiss={() => setMode("code")}
            onSubmitted={() => setMode("code")}
            onSubmittingChange={setIsAssistantSubmitting}
            onAssistantSubmit={onAssistantSubmit}
          />
          <p className="text-muted-foreground mt-1 text-right text-[10px]">
            Esc to dismiss
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return <div className="relative">{children(assistantAction)}</div>;
}
