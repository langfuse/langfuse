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
  FormControl,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Score } from "@prisma/client";
import { useState } from "react";
import * as z from "zod";

import { useFieldArray, useForm } from "react-hook-form";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Award, LockIcon, Plus, Trash } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { AutoComplete, type Option } from "@/src/components/auto-complete";
import { Textarea } from "@/src/components/ui/textarea";

const formSchema = z.object({
  scores: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().refine((value) => value !== "", {
          message: "Name is required",
        }),
        value: z.string().refine((value) => isFinite(parseFloat(value)), {
          message: "Invalid number string",
        }),
        comment: z.string().optional(),
      }),
    )
    .refine((value) => {
      const names = value.map((v) => v.name);
      return names.length === new Set(names).size;
    }, "Names need to be unique"),
});

export function ExpertScoreButton({
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
  variant?: "button" | "badge" | "row-action";
}) {
  const hasAccess = useHasAccess({
    projectId,
    scope: "scores:CUD",
  });

  const expertScoreNamesInProject = api.scores.filterOptions.useQuery({
    projectId,
    type: "EXPERT",
  });

  const currentExpertScores = scores.filter(
    (s) =>
      (s.type === "EXPERT" ||
        (s.name === "manual-score" && s.type === "DEFAULT")) && // legacy manual scores
      s.traceId === traceId &&
      (observationId !== undefined
        ? s.observationId === observationId
        : s.observationId === null),
  );

  const utils = api.useUtils();
  const onSuccess = async () => {
    await Promise.all([
      utils.scores.invalidate(),
      utils.traces.invalidate(),
      utils.sessions.invalidate(),
    ]);
  };
  const mutUpsertManyScores = api.scores.expertUpdate.useMutation({
    onSuccess,
  });

  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema, undefined, {
      raw: true,
    }),
    defaultValues: {
      scores: [],
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
      form.setValue(
        "scores",
        currentExpertScores.map((s) => ({
          ...s,
          value: s.value.toString(),
          comment: s.comment ?? "",
        })),
      );
      if (currentExpertScores.length === 0) {
        addNewScore();
      }
      setOpen(true);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await mutUpsertManyScores.mutateAsync({
      traceId,
      observationId,
      scores: values.scores.map((v) => ({
        ...v,
        id: v.id === "new" ? undefined : v.id,
        value: parseFloat(v.value),
        traceId,
        comment: v.comment,
        observationId: observationId ?? null,
      })),
    });
    onOpenChange(false);
  };

  const addNewScore = () => {
    append({ id: "new", name: "", value: "0", comment: "" });
  };

  if (!hasAccess && variant === "badge") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild={variant !== "badge"}>
        {variant === "button" ? (
          <Button variant="secondary" disabled={!hasAccess}>
            Edit Scores
            {!hasAccess ? <LockIcon className="ml-2 h-3 w-3" /> : null}
          </Button>
        ) : variant === "badge" ? (
          <Badge className="hidden cursor-pointer group-hover/scores:block">
            Edit scores
          </Badge>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            disabled={!hasAccess}
            title="Edit scores"
          >
            <Award className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="mb-5">Update Scores</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-2"
          >
            <div className="grid grid-cols-6 gap-2">
              <span className="col-span-2">
                <FormLabel>Name</FormLabel>
              </span>
              <span className="col-span-1">
                <FormLabel>Score</FormLabel>
              </span>
              <span className="col-span-2">
                <FormLabel>Comment (optional)</FormLabel>
              </span>
            </div>
            {fields.map((field, index) => {
              // name and value, value as input field
              return (
                <div className="grid grid-cols-6 gap-2" key={field.id}>
                  <FormField
                    control={form.control}
                    name={`scores.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormControl>
                          <AutoComplete
                            {...field}
                            options={[
                              ...(expertScoreNamesInProject.data?.name.map(
                                ({ value }) => ({ label: value, value: value }),
                              ) ?? []),
                            ]}
                            placeholder="Score name"
                            onValueChange={(value: Option) => {
                              field.onChange(value.value);
                            }}
                            value={{ value: field.value, label: field.value }}
                            disabled={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`scores.${index}.value`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...field} type="number" step={0.01} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`scores.${index}.comment`}
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Comment"
                            className="h-10 min-h-10"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => remove(index)}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              );
            })}

            <div className="flex justify-end space-x-2">
              <span className="flex-grow text-destructive">
                {form.formState.errors.scores?.root?.message}
              </span>
              <Button
                onClick={() => {
                  addNewScore();
                }}
                variant="secondary"
              >
                <Plus size={14} />
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Loading ..." : "Save"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
