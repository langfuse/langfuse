import { type ChangeEvent, useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  TOPIC_BACKFILL_MAX_TRACES,
  TOPIC_BACKFILL_WINDOW_DAYS,
  topicBackfillSourceSchema,
  type TopicBackfillSource,
} from "@langfuse/shared/topics";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { FormField } from "@/src/components/design-system/FormField/FormField";
import { Input } from "@/src/components/design-system/Input/Input";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { type TopicBackfill } from "./useTopicBackfill";

const COUNT_MESSAGE = `Choose between 1 and ${TOPIC_BACKFILL_MAX_TRACES} traces.`;
const backfillFormSchema = z.object({
  source: topicBackfillSourceSchema,
  limit: z
    .number({ message: COUNT_MESSAGE })
    .int(COUNT_MESSAGE)
    .min(1, COUNT_MESSAGE)
    .max(TOPIC_BACKFILL_MAX_TRACES, COUNT_MESSAGE),
});
type BackfillFormValues = z.infer<typeof backfillFormSchema>;

const SOURCES: ReadonlyArray<{
  value: TopicBackfillSource;
  label: string;
  description: string;
}> = [
  {
    value: "ready",
    label: "Latest ready traces",
    description:
      "The newest traces that have been idle for your idle time and lack a summary for a selected facet.",
  },
  {
    value: "random",
    label: `Random traces from the last ${TOPIC_BACKFILL_WINDOW_DAYS} days`,
    description: "A random sample of recent traces, summarized or not.",
  },
];

export type BackfillDialogProps = {
  backfill: TopicBackfill;
  closeDialog: () => void;
};

/** Dialog content; render it inside a `DialogController`. */
export function BackfillDialog({ backfill, closeDialog }: BackfillDialogProps) {
  const formId = useId();
  const form = useForm<BackfillFormValues>({
    resolver: zodResolver(backfillFormSchema),
    defaultValues: { source: "ready", limit: 50 },
  });

  function handleSubmit(values: BackfillFormValues) {
    backfill.schedule(values, closeDialog);
  }
  function handleSourceChange(value: string) {
    form.setValue("source", topicBackfillSourceSchema.parse(value));
  }
  function handleCountChange(event: ChangeEvent<HTMLInputElement>) {
    form.setValue("limit", event.target.valueAsNumber, {
      shouldValidate: form.formState.isSubmitted,
    });
  }

  return (
    <Dialog
      title="Run backfill"
      actions={[
        {
          label: "Run backfill",
          type: "submit",
          form: formId,
          loading: backfill.isPending,
          disabled: backfill.isPending,
        },
      ]}
    >
      <Dialog.Body>
        <form
          id={formId}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <p>
            Summarize past traces with your saved facets and models. This runs
            whether or not automatic processing is on, and its sampling rate
            does not apply. Traces whose summaries are current are skipped.
          </p>
          <FormField control={form.control} name="source" label="Traces">
            {({ value, id }) => (
              <RadioGroup value={value} onValueChange={handleSourceChange}>
                {SOURCES.map((source) => (
                  <BackfillSourceOption
                    key={source.value}
                    id={`${id}-${source.value}`}
                    {...source}
                  />
                ))}
              </RadioGroup>
            )}
          </FormField>
          <FormField
            control={form.control}
            name="limit"
            label="Number of traces"
            description={`Up to ${TOPIC_BACKFILL_MAX_TRACES} per backfill.`}
          >
            {({ value, onBlur, name, ref, id, error, inputDescribedById }) => (
              <Input
                id={id}
                ref={ref}
                name={name}
                type="number"
                inputMode="numeric"
                min={1}
                value={Number.isNaN(value) ? "" : value}
                error={Boolean(error)}
                aria-invalid={Boolean(error)}
                aria-describedby={inputDescribedById}
                onBlur={onBlur}
                onChange={handleCountChange}
              />
            )}
          </FormField>
          {backfill.matchedNothing ? (
            <p role="status" className="text-muted-foreground">
              No traces matched. Nothing was scheduled.
            </p>
          ) : null}
          {backfill.error ? (
            <p role="alert" className="text-destructive">
              {backfill.error}
            </p>
          ) : null}
        </form>
      </Dialog.Body>
    </Dialog>
  );
}

function BackfillSourceOption({
  id,
  value,
  label,
  description,
}: {
  id: string;
  value: TopicBackfillSource;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <RadioGroup.Item id={id} value={value} />
      <label htmlFor={id} className="-mt-0.5 flex flex-col gap-0.5">
        <span className="font-bold">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </label>
    </div>
  );
}
