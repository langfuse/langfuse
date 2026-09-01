import {
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useState,
} from "react";
import type { EvalTemplateSourceCodeLanguage } from "@langfuse/shared";
import { Code2, SendHorizontal, Sparkles } from "lucide-react";

import useLocalStorage from "@/src/components/useLocalStorage";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  useInAppAiAgent,
  useIsInAppAgentLauncherVisible,
} from "@/src/features/in-app-agent/components/InAppAiAgentProvider";
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

function getLanguageLabel(language: EvalTemplateSourceCodeLanguage) {
  return language === "PYTHON" ? "Python" : "TypeScript";
}

function getAssistantPrompt({
  context,
  request,
  sourceCodeLanguage,
}: {
  context: CodeEvaluatorAssistantContext;
  request: string;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage;
}) {
  if (context === "scratch") {
    return `Create a new ${getLanguageLabel(sourceCodeLanguage)} code evaluator in Langfuse for this request:

${request}

Ask follow-up questions if the evaluation criteria or score output are ambiguous. Then write the evaluator code and create the evaluator in Langfuse after I approve the tool call.`;
  }

  return `Update the code evaluator shown on the current Langfuse page for this request:

${request}

First load the current evaluator so you preserve its existing configuration and only change what is needed. Ask follow-up questions if the requested change is ambiguous, then update the evaluator after I approve the tool call.`;
}

function AssistantComposer({
  context,
  sourceCodeLanguage,
  onCodeMode,
}: {
  context: CodeEvaluatorAssistantContext;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage;
  onCodeMode: () => void;
}) {
  const { openAssistant, submit } = useInAppAiAgent();
  const [request, setRequest] = useState("");
  const isScratch = context === "scratch";

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();
    if (!trimmedRequest || !openAssistant("code_evaluator_editor")) return;

    const started = await submit(
      getAssistantPrompt({
        context,
        request: trimmedRequest,
        sourceCodeLanguage,
      }),
      {
        newConversation: true,
        entryPoint: "code-evaluator-editor",
      },
    );

    if (started) setRequest("");
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
    <form
      onSubmit={handleSubmit}
      className="bg-muted/30 flex min-h-56 flex-col justify-center gap-3 rounded-lg border p-6"
    >
      <div className="flex items-center gap-2 font-bold">
        <Sparkles className="h-4 w-4" />
        {isScratch
          ? "Build with Langfuse Assistant"
          : "Edit with Langfuse Assistant"}
      </div>
      <p className="text-muted-foreground text-sm">
        {isScratch
          ? "Describe what the evaluator should measure. The Assistant will clarify the requirements, write the code, and create the evaluator."
          : "Describe what should change. The Assistant will inspect the current evaluator before proposing an update."}
      </p>
      <div className="flex items-end gap-2">
        <Textarea
          aria-label={
            isScratch
              ? "Describe the code evaluator you want"
              : "Describe how to change this code evaluator"
          }
          autoComplete="off"
          maxLength={2000}
          rows={3}
          placeholder={
            isScratch
              ? "e.g. Score whether the response cites at least one source"
              : "e.g. Return 0 instead of throwing when the output is empty"
          }
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            resizeTextarea(event.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          className="max-h-40 resize-none"
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
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div>
        <Button type="button" variant="link" size="sm" onClick={onCodeMode}>
          <Code2 className="mr-1.5 h-4 w-4" />
          {isScratch ? "Code manually" : "Back to code"}
        </Button>
      </div>
    </form>
  );
}

export function CodeEvaluatorAssistantExperience({
  context,
  sourceCodeLanguage,
  children,
}: {
  context: CodeEvaluatorAssistantContext | null;
  sourceCodeLanguage: EvalTemplateSourceCodeLanguage;
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

  if (mode === "assistant") {
    return (
      <AssistantComposer
        context={context}
        sourceCodeLanguage={sourceCodeLanguage}
        onCodeMode={() => setMode("code")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode("assistant")}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {context === "scratch" ? "Start with AI" : "Edit with AI"}
        </Button>
      </div>
      {children}
    </div>
  );
}
