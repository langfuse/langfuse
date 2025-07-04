import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

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
  const [submittingButton, setSubmittingButton] = useState<
    "up" | "down" | null
  >(null);
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
      showSuccessToast({
        title: "Feedback saved",
        description: "Your feedback has been recorded successfully.",
      });
    },
    onError: (error) => {
      console.error("Error creating thumbs feedback:", error);
      trpcErrorToast(error);
    },
    onSettled: () => {
      setIsSubmitting(false);
      setSubmittingButton(null);
    },
  });

  const deleteScoreMutation = api.scores.deleteAnnotationScore.useMutation({
    onSuccess: () => {
      // Invalidate all scores queries to refresh the data
      utils.scores.invalidate();
      showSuccessToast({
        title: "Feedback removed",
        description: "Your feedback has been removed successfully.",
      });
    },
    onError: (error) => {
      console.error("Error deleting thumbs feedback:", error);
      trpcErrorToast(error);
    },
    onSettled: () => {
      setIsSubmitting(false);
      setSubmittingButton(null);
    },
  });

  const handleFeedback = async (isPositive: boolean) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmittingButton(isPositive ? "up" : "down");

    try {
      // If the clicked button is already selected, delete the score
      if (
        (isPositive && currentValue === 1) ||
        (!isPositive && currentValue === 0)
      ) {
        if (currentFeedback?.id) {
          await deleteScoreMutation.mutateAsync({
            projectId,
            id: currentFeedback.id,
          });
        }
      } else {
        // Create a new score
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
      }
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  };

  return (
    <div
      className={cn(
        "my-4 mr-4 self-stretch rounded-md bg-secondary px-3 pb-3 pt-2",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">Feedback panel</span>
      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="text-sm text-muted-foreground">Jud review:</div>
        <div className="flex items-end gap-2">
          <Button
            variant={currentValue === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => handleFeedback(true)}
            disabled={isSubmitting}
            className="h-9 w-9 p-0"
          >
            {isSubmitting && submittingButton === "up" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ThumbsUp className="size-4" />
            )}
          </Button>
          <Button
            variant={currentValue === 0 ? "default" : "outline"}
            size="sm"
            onClick={() => handleFeedback(false)}
            disabled={isSubmitting}
            className="h-9 w-9 p-0"
          >
            {isSubmitting && submittingButton === "down" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ThumbsDown className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
