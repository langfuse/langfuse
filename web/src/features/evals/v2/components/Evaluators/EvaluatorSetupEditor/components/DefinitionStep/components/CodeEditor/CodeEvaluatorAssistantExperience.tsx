import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import { SendHorizontal, Sparkles, WandSparkles } from "lucide-react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { EvaluatorAssistantEditDialog } from "@/src/features/evals/v2/components/Evaluators/EvaluatorSetupEditor/components/DefinitionStep/components/EvaluatorAssistantEditDialog";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const CODE_EVALUATOR_EDITOR_MODE_STORAGE_KEY =
  "langfuse:code-evaluator-editor-mode:v1";
const MAX_TEXTAREA_HEIGHT_PX = 160;

type EditorMode = "assistant" | "code";
export type CodeEvaluatorAssistantContext = "scratch" | "edit";

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
}

function AssistantComposer({
  onDismiss,
  onAssistantSubmit,
}: {
  onDismiss: () => void;
  onAssistantSubmit: (request: string) => Promise<boolean>;
}) {
  const [request, setRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();
    if (!trimmedRequest || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const started = await onAssistantSubmit(trimmedRequest);
      if (started) setRequest("");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
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
      !isSubmitting
    ) {
      event.preventDefault();
      onDismiss();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      className="border-border bg-background flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="text-primary-accent flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase">
        <Sparkles className="h-3.5 w-3.5" />
        Write it with AI
      </div>
      <h3 className="text-lg font-bold">
        Describe what this evaluator should check.
      </h3>
      <Textarea
        aria-label="Describe the code evaluator you want"
        autoComplete="off"
        maxLength={2000}
        rows={3}
        placeholder="Fail when the output does not exactly match the expected answer, ignoring case and trailing whitespace"
        value={request}
        disabled={isSubmitting}
        onChange={(event) => {
          setRequest(event.target.value);
          resizeTextarea(event.currentTarget);
        }}
        onKeyDown={handleTextareaKeyDown}
        className="max-h-40 min-h-24 resize-none"
      />
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
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
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
        onDismiss={() => setMode("code")}
        onAssistantSubmit={onAssistantSubmit}
      />
    );
  }

  const assistantAction = (
    <button
      ref={assistantTriggerRef}
      type="button"
      aria-haspopup={context === "edit" ? "dialog" : undefined}
      className="bg-background text-muted-foreground hover:border-border hover:text-foreground hover:bg-accent ring-offset-background focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 font-sans text-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
      onClick={() => setMode("assistant")}
    >
      <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {context === "edit" ? "Edit with AI" : "Write with AI"}
    </button>
  );

  if (context === "edit") {
    return (
      <>
        {children(assistantAction)}
        <EvaluatorAssistantEditDialog
          open={mode === "assistant"}
          evaluatorType="code"
          returnFocusRef={assistantTriggerRef}
          onOpenChange={(open) => setMode(open ? "assistant" : "code")}
          onAssistantSubmit={onAssistantSubmit}
        />
      </>
    );
  }

  return <div className="relative">{children(assistantAction)}</div>;
}
