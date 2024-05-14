import { Button } from "@/src/components/ui/button";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { JsonEditor } from "@/src/components/json-editor";
import { type Prisma } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

const formSchema = z.object({
  datasetId: z.string().min(1, "Select a dataset"),
  input: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
});

export const NewDatasetItemForm = (props: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  datasetId?: string;
  className?: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetId: props.datasetId ?? "",
      input: props.input ? JSON.stringify(props.input, null, 2) : "",
      expectedOutput: props.output ? JSON.stringify(props.output, null, 2) : "",
      metadata: props.metadata ? JSON.stringify(props.metadata, null, 2) : "",
    },
  });

  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId: props.projectId,
  });

  const utils = api.useUtils();
  const createDatasetItemMutation = api.datasets.createDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (props.traceId) {
      capture("dataset_item:new_from_trace_form_submit", {
        object: props.observationId ? "observation" : "trace",
      });
    } else {
      capture("dataset_item:new_form_submit");
    }
    createDatasetItemMutation
      .mutateAsync({
        ...values,
        projectId: props.projectId,
        sourceTraceId: props.traceId,
        sourceObservationId: props.observationId,
      })
      .then(() => {
        props.onFormSuccess?.();
        form.reset();
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex flex-col gap-6", props.className)}
      >
        <FormField
          control={form.control}
          name="datasetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Dataset</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dataset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {datasets.data?.map((dataset) => (
                    <SelectItem value={dataset.id} key={dataset.id}>
                      {dataset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Input</FormLabel>
                <FormControl>
                  <JsonEditor
                    defaultValue={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expectedOutput"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Expected output</FormLabel>
                <FormControl>
                  <JsonEditor
                    defaultValue={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="metadata"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <FormLabel>Metadata</FormLabel>
              <FormControl>
                <JsonEditor
                  defaultValue={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          loading={createDatasetItemMutation.isLoading}
          className="mt-auto w-full"
        >
          Add to dataset
        </Button>
      </form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </Form>
  );
};
