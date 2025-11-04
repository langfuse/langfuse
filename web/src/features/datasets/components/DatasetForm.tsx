import { Button } from "@/src/components/ui/button";
import * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { useMemo, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { CodeMirrorEditor } from "@/src/components/editor";
import { DatasetNameSchema, type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Label } from "@/src/components/ui/label";
import { useRouter } from "next/router";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { DatasetSchemaInput } from "./DatasetSchemaInput";
import { isValidJSONSchema } from "@langfuse/shared";

interface BaseDatasetFormProps {
  mode: "create" | "update" | "delete";
  projectId: string;
  onFormSuccess?: () => void;
  className?: string;
}

interface CreateDatasetFormProps extends BaseDatasetFormProps {
  mode: "create";
  folderPrefix?: string;
}

interface DeleteDatasetFormProps extends BaseDatasetFormProps {
  mode: "delete";
  datasetName: string;
  datasetId: string;
}

interface UpdateDatasetFormProps extends BaseDatasetFormProps {
  mode: "update";
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: Prisma.JsonValue;
}

type DatasetFormProps =
  | CreateDatasetFormProps
  | UpdateDatasetFormProps
  | DeleteDatasetFormProps;

// Validation schema for JSON Schema strings
const jsonSchemaStringValidator = z.string().refine(
  (value) => {
    if (value === "") return true; // Empty is valid (means no schema)
    try {
      const parsed = JSON.parse(value);
      return isValidJSONSchema(parsed);
    } catch (error) {
      return false;
    }
  },
  {
    message: "Must be a valid JSON Schema",
  },
);

const formSchema = z.object({
  name: DatasetNameSchema,
  description: z.string(),
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
  inputSchema: jsonSchemaStringValidator,
  expectedOutputSchema: jsonSchemaStringValidator,
});

export const DatasetForm = (props: DatasetFormProps) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues:
      props.mode === "update"
        ? {
            name: props.datasetName,
            description: props.datasetDescription ?? "",
            metadata: props.datasetMetadata
              ? JSON.stringify(props.datasetMetadata, null, 2)
              : "",
            inputSchema: "",
            expectedOutputSchema: "",
          }
        : {
            name:
              props.mode === "create" && props.folderPrefix
                ? `${props.folderPrefix}/`
                : "",
            description: "",
            metadata: "",
            inputSchema: "",
            expectedOutputSchema: "",
          },
  });

  const utils = api.useUtils();
  const router = useRouter();
  const createMutation = api.datasets.createDataset.useMutation();
  const renameMutation = api.datasets.updateDataset.useMutation();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const allDatasets = api.datasets.allDatasetMeta.useQuery(
    { projectId: props.projectId },
    {
      enabled: props.mode === "create" || props.mode === "update",
    },
  );

  const allDatasetNames = useMemo(() => {
    return allDatasets.data?.map((dataset) => ({ value: dataset.name })) ?? [];
  }, [allDatasets.data]);

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allDatasetNames,
    form,
    errorMessage: "Dataset name already exists.",
    whitelistedName: props.mode === "update" ? props.datasetName : undefined,
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    // Parse schemas if they're not empty (tRPC expects objects for DatasetJSONSchema)
    const inputSchema =
      values.inputSchema === "" ? undefined : JSON.parse(values.inputSchema);
    const expectedOutputSchema =
      values.expectedOutputSchema === ""
        ? undefined
        : JSON.parse(values.expectedOutputSchema);

    const trimmedValues = {
      name: values.name.trim(),
      description: values.description !== "" ? values.description.trim() : null,
      // Keep metadata as string - resolveMetadata in tRPC will parse it
      metadata: values.metadata !== "" ? values.metadata : null,
      inputSchema,
      expectedOutputSchema,
    };

    if (props.mode === "create") {
      capture("datasets:new_form_submit");
      createMutation
        .mutateAsync({
          ...trimmedValues,
          projectId: props.projectId,
        })
        .then((dataset) => {
          void utils.datasets.invalidate();
          props.onFormSuccess?.();
          form.reset();
          router.push(
            `/project/${props.projectId}/datasets/${dataset.id}/items`,
          );
        })
        .catch((error: Error) => {
          setFormError(error.message);
          console.error(error);
        });
    } else if (props.mode === "update") {
      capture("datasets:update_form_submit");
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

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();

    // helps with type safety
    if (props.mode !== "delete") return;

    if (deleteConfirmationInput !== props.datasetName) {
      setFormError("Please type the correct dataset name to confirm deletion");
      return;
    }

    capture("datasets:delete_form_submit");
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
    <Form {...form}>
      <form
        onSubmit={
          props.mode === "delete" ? handleDelete : form.handleSubmit(onSubmit)
        }
        className="flex h-full min-h-0 flex-col"
      >
        <DialogBody>
          {props.mode === "delete" ? (
            <div className="mb-8 grid w-full gap-1.5">
              <Label htmlFor="delete-confirmation">
                Type &quot;{props.datasetName}&quot; to confirm deletion
              </Label>
              <Input
                id="delete-confirmation"
                value={deleteConfirmationInput}
                onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              />
            </div>
          ) : (
            <div className="mb-8 space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormDescription>
                      Use slashes &apos;/&apos; in dataset names to organize
                      them into <em>folders</em>.
                    </FormDescription>
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
              <FormField
                control={form.control}
                name="metadata"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metadata (optional)</FormLabel>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                        }}
                        minHeight="none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="inputSchema"
                render={({ field }) => (
                  <DatasetSchemaInput
                    label="Enforce input schema"
                    description="Validate dataset item inputs against a JSON Schema. All new and existing items must conform to this schema."
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <FormField
                control={form.control}
                name="expectedOutputSchema"
                render={({ field }) => (
                  <DatasetSchemaInput
                    label="Enforce expected output schema"
                    description="Validate dataset item expected outputs against a JSON Schema. All new and existing items must conform to this schema."
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <div className="flex w-full flex-col gap-4">
            <Button
              type="submit"
              variant={props.mode === "delete" ? "destructive" : "default"}
              disabled={!!form.formState.errors.name}
              loading={
                (props.mode === "create" && createMutation.isPending) ||
                (props.mode === "delete" && deleteMutation.isPending)
              }
              className="w-full"
            >
              {props.mode === "create"
                ? "Create dataset"
                : props.mode === "delete"
                  ? "Delete Dataset"
                  : "Update dataset"}
            </Button>
            {formError && (
              <p className="mt-4 text-center text-sm text-red-500">
                <span className="font-bold">Error:</span> {formError}
              </p>
            )}
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
};
