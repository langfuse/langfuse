import { type SyntheticEvent, useState } from "react";
import { BotMessageSquare, Sparkles } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useInAppAiAgent } from "./InAppAiAgentProvider";

export function InAppAgentWidgetComposer({
  dashboardId,
  onSubmitted,
}: {
  dashboardId: string;
  onSubmitted: () => void;
}) {
  const { isAvailable, isRunning, isSubmitting, startAssistantRun } =
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

    const started = await startAssistantRun({
      source: "dashboard_widget",
      dashboardId,
      request: trimmedRequest,
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
        Describe the chart you need. The assistant will create it and add it to
        this dashboard.
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
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
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

export function InAppAgentDashboardComposer({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  const { isAvailable, isRunning, isSubmitting, startAssistantRun } =
    useInAppAiAgent();
  const [includeWidgets, setIncludeWidgets] = useState(true);

  if (!isAvailable) {
    return null;
  }

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription || isRunning || isSubmitting) {
      return;
    }

    await startAssistantRun({
      source: "dashboard_create",
      name: trimmedName,
      description: trimmedDescription,
      includeWidgets,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-4"
    >
      <div>
        <div className="flex items-center gap-2 font-medium">
          <Sparkles className="h-4 w-4" />
          Build with Assistant
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Use the name and purpose above to create this dashboard in a fresh
          assistant conversation.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="assistant-dashboard-widgets"
          checked={includeWidgets}
          disabled={isRunning || isSubmitting}
          onCheckedChange={(checked) => {
            setIncludeWidgets(checked === true);
          }}
        />
        <Label
          htmlFor="assistant-dashboard-widgets"
          className="cursor-pointer leading-4"
        >
          Design and add widgets for this dashboard
        </Label>
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={
          !name.trim() || !description.trim() || isRunning || isSubmitting
        }
      >
        <BotMessageSquare className="mr-1 h-4 w-4" />
        Continue with Assistant
      </Button>
    </form>
  );
}
