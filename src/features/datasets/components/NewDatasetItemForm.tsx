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

const formSchema = z.object({
  datasetId: z.string().min(1, "Select a dataset"),
  input: z.string(),
  expectedOutput: z.string(),
});

export const NewDatasetItemForm = (props: {
  projectId: string;
  observationId?: string;
  observationInput?: string;
  observationOutput?: string;
  datasetId?: string;
  onFormSuccess?: () => void;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetId: props.datasetId ?? "",
      input: props.observationInput,
      expectedOutput: props.observationOutput,
    },
  });

  const datasets = api.datasets.all.useQuery({ projectId: props.projectId });

  const utils = api.useContext();
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
    <div>
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8"
        >
          <FormField
            control={form.control}
            name="datasetId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Dataset</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Input</FormLabel>
                <FormControl>
                  <Textarea {...field} className="min-h-[120px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="expectedOutput"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expected output</FormLabel>
                <FormControl>
                  <Textarea {...field} className="min-h-[120px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            loading={createDatasetItemMutation.isLoading}
            className="w-full"
          >
            Add to dataset
          </Button>
        </form>
      </Form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );
};
