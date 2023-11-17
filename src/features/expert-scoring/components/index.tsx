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
import { LockIcon, Trash } from "lucide-react";
import { Input } from "@/src/components/ui/input";

const formSchema = z.object({
  scores: z.array(
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

  const currentExpertScores = scores.filter(
    (s) =>
      (s.type === "EXPERT" ||
        (s.name === "manual-score" && s.type === "DEFAULT")) && // legacy manual scores
      s.traceId === traceId &&
      (observationId !== undefined
        ? s.observationId === observationId
        : s.observationId === null),
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
        commment: v.comment ?? null,
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
            className="space-y-4"
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
                          <Input placeholder="Name" {...field} />
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
                          <Input {...field} type="number" />
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
                          <Input {...field} placeholder="Comment" />
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

            <div className="flex justify-end space-x-4">
              <Button
                onClick={() =>
                  append({ id: "new", name: "", value: "0", comment: "" })
                }
              >
                Add new
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Loading ..." : "Update"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
