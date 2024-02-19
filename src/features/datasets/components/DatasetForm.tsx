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
import { api } from "@/src/utils/api";
import { useState } from "react";
import { usePostHog } from "posthog-js/react";
import { Input } from "@/src/components/ui/input";

interface BaseDatasetFormProps {
  mode: "create" | "rename";
  projectId: string;
  onFormSuccess?: () => void;
}

interface CreateDatasetFormProps extends BaseDatasetFormProps {
  mode: "create";
}

interface RenameDatasetFormProps extends BaseDatasetFormProps {
  mode: "rename";
  datasetId: string; // Make datasetId non-optional for 'rename' mode
  datasetName: string;
}

type DatasetFormProps = CreateDatasetFormProps | RenameDatasetFormProps;

const formSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Input is required" })
    .refine((name) => name.trim() === name, {
      message: "Input should not have leading or trailing whitespace",
    })
    .refine((name) => name.trim().length > 0, {
      message: "Input should not be only whitespace",
    }),
});

export const DatasetForm = (props: DatasetFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  const utils = api.useUtils();
  const createMutation = api.datasets.createDataset.useMutation({
    onSuccess: () => {
      void utils.datasets.invalidate();
      props.onFormSuccess?.();
      form.reset();
    },
    onError: (error) => setFormError(error.message),
  });

  const renameMutation = api.datasets.renameDataset.useMutation({
    onSuccess: () => {
      void utils.datasets.invalidate();
      props.onFormSuccess?.();
      form.reset();
    },
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (props.mode === "create") {
      posthog.capture("datasets:new_dataset_form_submit");
      createMutation
        .mutateAsync({
          ...values,
          projectId: props.projectId,
        })
        .then(() => {
          props.onFormSuccess?.();
          form.reset();
        })
        .catch((error: Error) => {
          console.error(error);
        });
    } else if (props.datasetId) {
      posthog.capture("datasets:rename_dataset_form_submit");
      renameMutation
        .mutateAsync({
          ...values,
          projectId: props.projectId,
          datasetId: props.datasetId,
        })
        .then(() => {
          props.onFormSuccess?.();
          form.reset();
        })
        .catch((error: Error) => {
          console.error(error);
        });
    }
  }

  return (
    <div>
      <Form {...form}>
        <form
          onSubmit={() => form.handleSubmit(onSubmit)}
          className="space-y-8"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={
                      props.mode === "rename" ? props.datasetName : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            loading={props.mode === "create" && createMutation.isLoading}
            className="w-full"
          >
            {props.mode === "create" ? "Create dataset" : "Rename dataset"}
          </Button>
        </form>
      </Form>
      {formError && (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      )}
    </div>
  );
};
