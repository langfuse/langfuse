import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useRef,
  useState,
} from "react";
import { SendHorizontal } from "lucide-react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { useIsInAppAgentLauncherVisible } from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";

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
  context,
  onAssistantSubmit,
}: {
  context: CodeEvaluatorAssistantContext;
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
    try {
      const started = await onAssistantSubmit(trimmedRequest);

      if (started) setRequest("");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Textarea
        aria-label={
          isScratch
            ? "Describe the code evaluator you want"
            : "Describe how to change this code evaluator"
        }
        autoComplete="off"
        maxLength={2000}
        rows={2}
        placeholder={
          isScratch
            ? "Describe what the evaluator should measure…"
            : "Describe what should change…"
        }
        value={request}
        disabled={isSubmitting}
        onChange={(event) => {
          setRequest(event.target.value);
          resizeTextarea(event.currentTarget);
        }}
        onKeyDown={handleKeyDown}
        className="max-h-40 min-h-16 resize-none"
      />
      <Button
        type="submit"
        size="icon"
        variant="outline"
        className="shrink-0"
        aria-label={
          isScratch
            ? "Create with Langfuse Assistant"
            : "Update with Langfuse Assistant"
        }
        disabled={!request.trim()}
        loading={isSubmitting}
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
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
  children: ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const isAssistantLauncherVisible = useIsInAppAgentLauncherVisible();
  const [preferredScratchMode, setPreferredScratchMode] =
    useLocalStorage<EditorMode>(
      CODE_EVALUATOR_EDITOR_MODE_STORAGE_KEY,
      "assistant",
    );
  const [editMode, setEditMode] = useState<EditorMode>("code");
  const mode = context === "scratch" ? preferredScratchMode : editMode;

  if (!context || !isAssistantLauncherVisible) return children;

  const setMode = (nextMode: EditorMode) => {
    if (context === "scratch") setPreferredScratchMode(nextMode);
    else setEditMode(nextMode);

    capture("evaluators:code_editor_mode_switch", {
      context,
      mode: nextMode,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <div
          role="group"
          className="bg-muted inline-flex rounded-md p-0.5"
          aria-label="Code evaluator input mode"
        >
          {(["code", "assistant"] as const).map((inputMode) => (
            <button
              key={inputMode}
              type="button"
              aria-pressed={mode === inputMode}
              onClick={() => {
                if (mode !== inputMode) setMode(inputMode);
              }}
              className={cn(
                "text-muted-foreground hover:text-foreground rounded-sm px-2 py-1 text-xs transition-colors",
                mode === inputMode && "bg-background text-foreground shadow-xs",
              )}
            >
              {inputMode === "code" ? "Code" : "AI input"}
            </button>
          ))}
        </div>
      </div>
      {mode === "assistant" ? (
        <AssistantComposer
          context={context}
          onAssistantSubmit={onAssistantSubmit}
        />
      ) : (
        children
      )}
    </div>
  );
}
