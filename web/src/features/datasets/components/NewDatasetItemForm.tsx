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
import { usePostHog } from "posthog-js/react";
import { Textarea } from "@/src/components/ui/textarea";
import { type Prisma } from "@langfuse/shared/src/db";

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
        "Invalid input. Please provide a JSON object or a string value enclosed in double quotes.",
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
        "Invalid input. Please provide a JSON object or a string value enclosed in double quotes.",
    },
  ),
});

export const NewDatasetItemForm = (props: {
  projectId: string;
  traceId?: string;
  observationId?: string;
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  datasetId?: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetId: props.datasetId ?? "",
      input: props.input ? JSON.stringify(props.input, null, 2) : "",
      expectedOutput: props.output ? JSON.stringify(props.output, null, 2) : "",
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
    posthog.capture("datasets:new_dataset_item_form_submit", {
      hasSourceTrace: !!props.traceId,
      hasSourceObservation: !!props.observationId,
    });
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
        className="flex flex-col gap-6"
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
        <div className="grid flex-1 content-stretch gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Input</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    className="min-h-[150px] flex-1 font-mono text-xs"
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
                  <Textarea
                    {...field}
                    className="min-h-[150px] flex-1 font-mono text-xs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button
          type="submit"
          loading={createDatasetItemMutation.isLoading}
          className="w-full"
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
