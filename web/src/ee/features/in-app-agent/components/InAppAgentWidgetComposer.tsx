import { type KeyboardEvent, type SyntheticEvent, useState } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";

const MAX_TEXTAREA_HEIGHT_PX = 160;

// Grow the textarea to fit its content up to a cap, then scroll. Driven from the
// change/submit events (no effect): the initiating event owns the DOM sync.
function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
}

const getWidgetCreationPrompt = (request: string) =>
  `Create a dashboard widget for this request and add it to the current dashboard:\n\n${request}\n\nChoose an appropriate data view, metrics, dimensions, filters, and chart type. Briefly explain the plan, then create the widget.`;

export function InAppAgentWidgetComposer({
  onSubmitted,
}: {
  onSubmitted: () => void;
}) {
  const { isAvailable, isRunning, isSubmitting, openAssistant, submit } =
    useInAppAiAgent();
  const [request, setRequest] = useState("");

  if (!isAvailable) {
    return null;
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedRequest = request.trim();

    if (!trimmedRequest || isRunning || isSubmitting) {
      return;
    }

    if (!openAssistant("dashboard_widget")) {
      return;
    }

    const started = await submit(getWidgetCreationPrompt(trimmedRequest), {
      newConversation: true,
      entryPoint: "add-widget-modal",
    });

    if (started) {
      setRequest("");
      onSubmitted();
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
    <form
      onSubmit={handleSubmit}
      className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2 font-bold">
        <Sparkles className="h-4 w-4" />
        Add with Langfuse Assistant
      </div>
      <p className="text-muted-foreground text-xs">
        Describe the chart you need. The Assistant will create it as a widget
        and add it to this dashboard.
      </p>
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Describe the widget you want"
          autoComplete="off"
          maxLength={2000}
          rows={1}
          placeholder="e.g. Show p95 latency by model over the last 7 days"
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
            resizeTextarea(event.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          className="max-h-40 min-h-8 resize-none px-2 py-1 leading-5"
        />
        <Button
          type="submit"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-md border"
          variant="outline"
          aria-label="Add with Langfuse Assistant"
          disabled={!request.trim() || isRunning || isSubmitting}
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
