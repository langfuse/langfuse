import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

interface TraceThumbsFeedbackProps {
  traceId: string;
  projectId: string;
  environment?: string;
  className?: string;
}

export const TraceThumbsFeedback = ({
  traceId,
  projectId,
  environment = "default",
  className,
}: TraceThumbsFeedbackProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const utils = api.useUtils();

  // Query existing thumbs feedback scores for this trace
  const existingScores = api.scores.all.useQuery(
    {
      projectId,
      filter: [
        {
          column: "Trace ID",
          type: "string",
          operator: "=",
          value: traceId,
        },
        {
          column: "Name",
          type: "string",
          operator: "=",
          value: "thumbs_feedback",
        },
      ],
      orderBy: {
        column: "timestamp",
        order: "DESC",
      },
      page: 0,
      limit: 1,
    },
    {
      enabled: !!traceId && !!projectId,
    },
  );

  // Get the current feedback state (most recent score)
  const currentFeedback = existingScores.data?.scores?.[0];
  const currentValue = currentFeedback?.value;

  const createScoreMutation = api.scores.createAnnotationScore.useMutation({
    onSuccess: () => {
      // Invalidate all scores queries to refresh the data
      utils.scores.invalidate();
    },
    onError: (error) => {
      console.error("Error creating thumbs feedback:", error);
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const handleFeedback = async (isPositive: boolean) => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      await createScoreMutation.mutateAsync({
        projectId,
        name: "thumbs_feedback",
        value: isPositive ? 1 : 0,
        stringValue: isPositive ? "True" : "False",
        dataType: "BOOLEAN",
        scoreTarget: {
          type: "trace",
          traceId,
        },
        environment,
      });
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  };

  console.log("existingScores", existingScores.data);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground">Feedback:</span>
      <Button
        variant={currentValue === 1 ? "default" : "outline"}
        size="sm"
        onClick={() => handleFeedback(true)}
        disabled={isSubmitting}
        className="h-8 w-8 p-0"
      >
        <ThumbsUp className="h-4 w-4" />
      </Button>
      <Button
        variant={currentValue === 0 ? "default" : "outline"}
        size="sm"
        onClick={() => handleFeedback(false)}
        disabled={isSubmitting}
        className="h-8 w-8 p-0"
      >
        <ThumbsDown className="h-4 w-4" />
      </Button>
      {isSubmitting && (
        <span className="text-xs text-muted-foreground">Saving...</span>
      )}
    </div>
  );
};
