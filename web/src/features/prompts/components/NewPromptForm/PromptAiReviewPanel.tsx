import {
  usePromptAiReview,
  type ChatMessage,
} from "@/src/features/prompts/components/NewPromptForm/PromptAiReviewProvider";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { X, Send, InfoIcon } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { PromptType } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";
import { PromptFeedbackCategory } from "@/src/features/prompt-assistant/validation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { ModelParameters } from "@/src/components/ModelParameters";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";

const ChatMessageComponent = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] overflow-hidden rounded-lg",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {isUser ? (
          <div className="px-3 py-2 text-sm text-primary-foreground">
            {message.content}
          </div>
        ) : (
          <div className="text-sm">
            <MarkdownView markdown={message.content} />
          </div>
        )}
      </div>
    </div>
  );
};

export const PromptAiReviewPanel = ({
  className,
  form,
}: {
  className?: string;
  form: UseFormReturn<any>;
}) => {
  const { open, setOpen, messages, addMessage, clearMessages } =
    usePromptAiReview();
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const projectId = useProjectIdFromURL();
  const close = () => setOpen(false);

  const aiReviewMutation = api.promptAssistant.createCompletion.useMutation();

  // Use the standard model params hook
  const modelParamsHook = useModelParams("prompt-ai-review");

  const isModelConfigured = !!(
    projectId &&
    modelParamsHook.modelParams.provider.value &&
    modelParamsHook.modelParams.model.value
  );

  const canSubmit = !!(inputValue.trim() && isModelConfigured);

  const getPromptText = () => {
    const formValues = form.getValues();
    return formValues.type === PromptType.Text
      ? formValues.textPrompt
      : JSON.stringify(formValues.chatPrompt, null, 2);
  };

  const buildModelParams = () => ({
    provider: modelParamsHook.modelParams.provider.value,
    adapter: modelParamsHook.modelParams.adapter.value,
    model: modelParamsHook.modelParams.model.value,
    temperature: modelParamsHook.modelParams.temperature?.enabled
      ? modelParamsHook.modelParams.temperature.value
      : undefined,
    max_tokens: modelParamsHook.modelParams.max_tokens?.enabled
      ? modelParamsHook.modelParams.max_tokens.value
      : undefined,
    top_p: modelParamsHook.modelParams.top_p?.enabled
      ? modelParamsHook.modelParams.top_p.value
      : undefined,
  });

  // Trigger initial completion when panel opens and prompt is not empty
  useEffect(() => {
    if (open && messages.length === 0 && isModelConfigured && !isSubmitting) {
      const promptText = getPromptText();
      if (promptText?.trim()) {
        triggerInitialCompletion();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages.length, isModelConfigured, isSubmitting]);

  const triggerInitialCompletion = async () => {
    setIsSubmitting(true);

    try {
      const response = await aiReviewMutation.mutateAsync({
        projectId,
        feedbackCategory: PromptFeedbackCategory.General,
        messages: [],
        targetPrompt: getPromptText() || "",
        modelParams: buildModelParams(),
      });

      addMessage({ role: "assistant", content: response });
    } catch (error) {
      addMessage({
        role: "assistant",
        content:
          "Sorry, I encountered an error while processing your initial review request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const userMessage = inputValue.trim();

    // Add user message immediately
    addMessage({ role: "user", content: userMessage });
    setInputValue("");
    setIsSubmitting(true);

    try {
      const response = await aiReviewMutation.mutateAsync({
        projectId,
        feedbackCategory: PromptFeedbackCategory.General,
        messages: [
          ...messages,
          { role: "user" as const, content: userMessage },
        ],
        targetPrompt: getPromptText() || "",
        modelParams: buildModelParams(),
      });

      addMessage({ role: "assistant", content: response });
    } catch (error) {
      addMessage({
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn([
        "flex h-full w-full min-w-0 flex-col border-l bg-background",
        className,
      ])}
    >
      <div className="border-b bg-background">
        <div className="flex w-full items-center justify-between gap-1 pb-2 pl-2 pt-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">AI Prompt Review</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <InfoIcon className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Get AI-powered feedback on your prompt content, clarity, and
                    effectiveness. You need to have a LLM provider setup and
                    selected.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="ml-2">
              <ModelParameters
                {...modelParamsHook}
                layout="compact"
                formDisabled={isSubmitting}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              aria-label="Clear Context"
              className="h-auto px-2 py-1 text-xs"
            >
              Clear Context
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={close}
              aria-label="Close AI Review"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages List */}
      <div className="h-[77vh] min-h-0 overflow-y-auto p-4">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground">
              Start a conversation about your prompt...
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatMessageComponent key={index} message={message} />
            ))
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t bg-card p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your prompt..."
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canSubmit || isSubmitting}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};
