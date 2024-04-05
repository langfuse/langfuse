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
  mode: "create" | "update" | "delete";
  projectId: string;
  onFormSuccess?: () => void;
  className?: string;
}

interface CreateDatasetFormProps extends BaseDatasetFormProps {
  mode: "create";
}

interface DeleteDatasetFormProps extends BaseDatasetFormProps {
  mode: "delete";
  datasetId: string;
}

interface UpdateDatasetFormProps extends BaseDatasetFormProps {
  mode: "update";
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
}

type DatasetFormProps =
  | CreateDatasetFormProps
  | UpdateDatasetFormProps
  | DeleteDatasetFormProps;

const formSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Input is required" })
    .refine((name) => name.trim().length > 0, {
      message: "Input should not be only whitespace",
    }),
  description: z.string(),
});

export const DatasetForm = (props: DatasetFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const posthog = usePostHog();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "update"
        ? {
            name: props.datasetName,
            description: props.datasetDescription ?? "",
          }
        : {
            name: "",
            description: "",
          },
  });

  const utils = api.useUtils();
  const createMutation = api.datasets.createDataset.useMutation();
  const renameMutation = api.datasets.updateDataset.useMutation();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  function onSubmit(values: z.infer<typeof formSchema>) {
    const trimmedValues = {
      ...values,
      name: values.name.trim(),
      description: values.description !== "" ? values.description.trim() : null,
    };
    if (props.mode === "create") {
      posthog.capture("datasets:new_dataset_form_submit");
      createMutation
        .mutateAsync({
          ...trimmedValues,
          projectId: props.projectId,
        })
        .then(() => {
          void utils.datasets.invalidate();
          props.onFormSuccess?.();
          form.reset();
        })
        .catch((error: Error) => {
          setFormError(error.message);
          console.error(error);
        });
    } else if (props.mode === "update") {
      posthog.capture("datasets:update_dataset_form_submit");
      renameMutation
        .mutateAsync({
          ...trimmedValues,
          projectId: props.projectId,
          datasetId: props.datasetId,
        })
        .then(() => {
          void utils.datasets.invalidate();
          props.onFormSuccess?.();
          form.reset();
        })
        .catch((error: Error) => {
          setFormError(error.message);
          console.error(error);
        });
    }
  }

  const handleDelete = () => {
    if (props.mode !== "delete") return;
    posthog.capture("datasets:delete_dataset_form_submit");
    deleteMutation
      .mutateAsync({
        projectId: props.projectId,
        datasetId: props.datasetId,
      })
      .then(() => {
        void utils.datasets.invalidate();
        props.onFormSuccess?.();
        form.reset();
      })
      .catch((error: Error) => {
        setFormError(error.message);
        console.error(error);
      });
  };

  return (
    <div>
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={
            props.mode === "delete" ? handleDelete : form.handleSubmit(onSubmit)
          }
        >
          {props.mode !== "delete" && (
            <div className="mb-8 space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
          <Button
            type="submit"
            variant={props.mode === "delete" ? "destructive" : "default"}
            loading={props.mode === "create" && createMutation.isLoading}
            className="w-full"
          >
            {props.mode === "create"
              ? "Create dataset"
              : props.mode === "delete"
                ? "Delete Dataset"
                : "Update dataset"}
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
