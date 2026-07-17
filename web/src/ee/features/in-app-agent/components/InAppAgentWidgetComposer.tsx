import { type SyntheticEvent, useState } from "react";
import { BotMessageSquare, Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useInAppAiAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";

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

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4" />
        Create with Assistant
      </div>
      <p className="text-muted-foreground text-xs">
        Describe the chart you need. The Assistant will create it as a reusable
        widget and add it to this dashboard.
      </p>
      <div className="flex gap-2">
        <Input
          aria-label="Describe the widget you want"
          autoComplete="off"
          maxLength={2000}
          placeholder="e.g. Show p95 latency by model over the last 7 days"
          value={request}
          onChange={(event) => {
            setRequest(event.target.value);
          }}
        />
        <Button
          type="submit"
          size="sm"
          aria-label="Create with Assistant"
          disabled={!request.trim() || isRunning || isSubmitting}
        >
          <BotMessageSquare className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
