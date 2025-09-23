import {
  usePromptAiReview,
  type ChatMessage,
} from "@/src/features/prompts/components/NewPromptForm/PromptAiReviewProvider";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { X, Send } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { useState } from "react";
import { api } from "@/src/utils/api";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { PromptType } from "@langfuse/shared";
import { type UseFormReturn } from "react-hook-form";

const ChatMessageComponent = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {message.content}
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
  const {
    open,
    setOpen,
    messages,
    addMessage,
    feedbackContext,
    clearMessages,
  } = usePromptAiReview();
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const projectId = useProjectIdFromURL();
  const close = () => setOpen(false);

  const aiReviewMutation = api.prompts.aiReview.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !projectId) return;

    const userMessage = inputValue.trim();

    // Add user message immediately
    addMessage({ role: "user", content: userMessage });
    setInputValue("");
    setIsSubmitting(true);

    try {
      // Get current prompt from form
      const formValues = form.getValues();
      const promptText =
        formValues.type === PromptType.Text
          ? formValues.textPrompt
          : JSON.stringify(formValues.chatPrompt, null, 2);

      const response = await aiReviewMutation.mutateAsync({
        projectId,
        langfusePrompt: promptText || "",
        feedbackContext,
        messages,
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
        <div className="flex min-h-12 w-full items-center justify-between gap-1 px-4 py-2">
          <h3 className="font-medium">AI Prompt Review</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              aria-label="Clear Context"
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
            disabled={!inputValue.trim() || isSubmitting}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};
