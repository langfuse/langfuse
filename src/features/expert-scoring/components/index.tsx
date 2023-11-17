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
import { type Score } from "@prisma/client";
import { useState } from "react";
import * as z from "zod";

import { useFieldArray, useForm } from "react-hook-form";
import { Slider } from "@/src/components/ui/slider";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { LockIcon } from "lucide-react";

const SCORE_NAME = "manual-score";

const formSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      value: z.number(),
      comment: z.string().optional(),
    }),
  ),
});

export function ManualScoreButton({
  traceId,
  scores,
  observationId,
  projectId,
}: {
  traceId: string;
  scores: Score[];
  observationId?: string;
  projectId: string;
}) {
  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const expertScores = scores.filter(
    (s) =>
      s.type === "EXPERT" ||
      (s.name === SCORE_NAME &&
        s.traceId === traceId &&
        (observationId !== undefined
          ? s.observationId === observationId
          : s.observationId === null)),
  );

  const utils = api.useContext();
  const onSuccess = async () => {
    await Promise.all([utils.scores.invalidate(), utils.traces.invalidate()]);
  };
  const mutUpsertManyScores = api.scores.expertUpsertMany.useMutation({
    onSuccess,
  });
  const mutDeleteScore = api.scores.delete.useMutation({ onSuccess });
  const usedNames = api.scores.usedNames.useQuery({
    projectId,
  });

  // const handleDelete = async () => {
  //   if (score) {
  //     await mutDeleteScore.mutateAsync(score.id);
  //     onOpenChange(false);
  //   }
  // };

  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema, undefined, {
      raw: true,
    }),
    defaultValues: {
      scores: [
        {
          id: "new",
          name: SCORE_NAME,
          value: 0,
          comment: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "scores",
    control: form.control,
  });

  const onOpenChange = (value: boolean) => {
    if (!hasAccess) return;
    if (!value) {
      form.reset();
      setOpen(false);
    } else {
      // form.setValue("score", score?.value ?? 0);
      // form.setValue("comment", score?.comment ?? "");
      setOpen(true);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await mutUpsertManyScores.mutateAsync({
      traceId,
      observationId,
      scores: values.map((v) => ({
        ...v,
        traceId,
        observationId: observationId ?? null,
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={!hasAccess}>
          Expert score
          {!hasAccess ? <LockIcon className="ml-2 h-3 w-3" /> : null}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="mb-5">Update Scores</DialogTitle>
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
