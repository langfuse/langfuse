import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormControl,
  FormMessage,
} from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Score } from "@langfuse/shared/src/db";
import { useState } from "react";
import * as z from "zod";

import { useForm } from "react-hook-form";
import { Slider } from "@/src/components/ui/slider";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { LockIcon } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const SCORE_NAME = "manual-score";

const formSchema = z.object({
  score: z.number(),
  comment: z.string().optional(),
});

export function ManualScoreButton({
  traceId,
  scores,
  observationId,
  projectId,
  variant = "button",
}: {
  traceId: string;
  scores: Score[];
  observationId?: string;
  projectId: string;
  variant?: "button" | "badge";
}) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });
  const score = scores.find(
    (s) =>
      s.name === SCORE_NAME &&
      s.traceId === traceId &&
      (observationId !== undefined
        ? s.observationId === observationId
        : s.observationId === null),
  );

  // variant === "badge" type is session
  // if observationId is defined type is observation
  // else type is trace
  const type =
    variant === "badge" ? "session" : observationId ? "observation" : "trace";
  const source = type === "session" ? "SessionDetail" : "TraceDetail";

  const utils = api.useUtils();
  const onSuccess = async () => {
    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.invalidate(),
      utils.sessions.invalidate(),
    ]);
  };
  const mutCreateScore = api.scores.createReviewScore.useMutation({
    onSuccess,
  });
  const mutUpdateScore = api.scores.updateReviewScore.useMutation({
    onSuccess,
  });
  const mutDeleteScore = api.scores.deleteReviewScore.useMutation({
    onSuccess,
  });

  const handleDelete = async () => {
    if (score) {
      await mutDeleteScore.mutateAsync(score.id);
      capture("score:delete", {
        type: type,
        source: source,
      });
      onOpenChange(false);
    }
  };

  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      score: 0,
      comment: "",
    },
  });

  const onOpenChange = (value: boolean) => {
    if (!hasAccess) return;
    if (!value) {
      form.reset();
      setOpen(false);
    } else {
      capture(score ? "score:update_form_open" : "score:create_form_open", {
        type: type,
        source: source,
      });
      form.setValue("score", score?.value ?? 0);
      form.setValue("comment", score?.comment ?? "");
      setOpen(true);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (score) {
      await mutUpdateScore.mutateAsync({
        id: score.id,
        value: values.score,
        comment: values.comment,
      });
      capture("score:update_form_submit", {
        type: type,
        source: source,
      });
    } else {
      await mutCreateScore.mutateAsync({
        name: SCORE_NAME,
        value: values.score,
        comment: values.comment,
        traceId,
        observationId,
      });
      capture("score:create_form_submit", {
        type: type,
        source: source,
      });
    }
    onOpenChange(false);
  };

  if (!hasAccess && variant === "badge") return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {variant === "button" ? (
          <Button variant="secondary" disabled={!hasAccess}>
            <span>{score ? `Update score: ${score.value}` : "Add score"}</span>
            {!hasAccess ? <LockIcon className="ml-2 h-3 w-3" /> : null}
          </Button>
        ) : (
          <Button className="h-6 rounded-full px-3 text-xs">
            {score ? "Update score" : "Add score"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">
            {score ? "Update Score" : "Create Score"}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8"
          >
            <FormField
              control={form.control}
              name="score"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Score</FormLabel>
                  <FormControl>
                    <Slider
                      {...field}
                      min={-1}
                      max={1}
                      step={0.01}
                      onValueChange={(value) => {
                        if (value[0] !== undefined) field.onChange(value[0]);
                      }}
                      value={[field.value]}
                      onChange={undefined}
                    />
                  </FormControl>
                  <FormDescription className="flex justify-between">
                    <span>-1 (bad)</span>
                    <span>1 (good)</span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="comment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comment (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end space-x-4">
              <Button type="submit" loading={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? "Loading ..."
                  : score
                    ? "Update"
                    : "Create"}
              </Button>
              {score && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  loading={mutDeleteScore.isLoading}
                >
                  Delete
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
