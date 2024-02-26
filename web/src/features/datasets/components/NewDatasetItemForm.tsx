import { Button } from "@/src/components/ui/button";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import JsonView from "react18-json-view";
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
import { type Prisma } from "@prisma/client";
import { jsonSchema } from "@/src/utils/zod";

const formSchema = z.object({
  datasetId: z.string().min(1, "Select a dataset"),
  input: z.string().refine(
    (value) => {
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    {
      message: "Invalid input. Please provide a JSON object",
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
  observationId?: string;
  observationInput?: Prisma.JsonValue;
  observationOutput?: Prisma.JsonValue;
  datasetId?: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const { observationInput, observationOutput } = props;
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetId: props.datasetId ?? "",
      input: observationInput ? JSON.stringify(observationInput, null, 2) : "",
      expectedOutput: observationOutput
        ? JSON.stringify(observationOutput, null, 2)
        : "",
    },
  });

  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
  });

  const utils = api.useUtils();
  const createDatasetItemMutation = api.datasets.createDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    posthog.capture("datasets:new_dataset_item_form_submit", {
      hasSourceObservation: !!props.observationId,
    });
    createDatasetItemMutation
      .mutateAsync({
        ...values,
        projectId: props.projectId,
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
                <JsonView
                  src={jsonSchema.parse(JSON.parse(field.value || "{}"))}
                  onEdit={(edit) => {
                    field.onChange(JSON.stringify(edit.src));
                  }}
                  onDelete={(edit) => {
                    field.onChange(JSON.stringify(edit.src));
                  }}
                  editable
                  className="rounded-md border border-gray-200 p-2 text-sm"
                />
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
                <JsonView
                  src={jsonSchema.parse(JSON.parse(field.value || "{}"))}
                  onEdit={(edit) => {
                    field.onChange(JSON.stringify(edit.src));
                  }}
                  onDelete={(edit) => {
                    field.onChange(JSON.stringify(edit.src));
                  }}
                  editable
                  className="rounded-md border border-gray-200 p-2 text-sm"
                />
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
