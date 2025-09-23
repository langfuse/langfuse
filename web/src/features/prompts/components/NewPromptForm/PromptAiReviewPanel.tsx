import { usePromptAiReview } from "@/src/features/prompts/components/NewPromptForm/PromptAiReviewProvider";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { X } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

export const PromptAiReviewPanel = ({ className }: { className?: string }) => {
  const { open, setOpen } = usePromptAiReview();
  const close = () => setOpen(false);

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
          <h3 className="font-medium">AI Review</h3>
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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="prompt-ai-review-input"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              AI Review Content
            </label>
            <Textarea
              id="prompt-ai-review-input"
              placeholder="AI review content will appear here..."
              className="min-h-[200px] resize-none"
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
};
