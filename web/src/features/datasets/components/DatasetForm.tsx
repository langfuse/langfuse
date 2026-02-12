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
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Input } from "@/src/components/ui/input";
import { CodeMirrorEditor } from "@/src/components/editor";
import {
  DatasetNameSchema,
  isValidJSONSchema,
  type Prisma,
} from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Label } from "@/src/components/ui/label";
import { useRouter } from "next/router";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { DatasetSchemaInput } from "./DatasetSchemaInput";
import { DatasetSchemaValidationError } from "./DatasetSchemaValidationError";

type ServerSideSchemaValidationErrors = {
  datasetItemId: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
}[];

// Ref interface for imperative form submission
export interface DatasetFormRef {
  submit: () => void;
}

interface BaseDatasetFormProps {
  mode: "create" | "update" | "delete";
  projectId: string;
  onFormSuccess?: () => void;
  onCreateDatasetSuccess?: (params: {
    id: string;
    name: string;
    inputSchema: unknown;
    expectedOutputSchema: unknown;
  }) => void;
  className?: string;
  redirectOnSuccess?: boolean;
  showFooter?: boolean;
  onValidationChange?: (isValid: boolean, isSubmitting: boolean) => void;
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
  datasetInputSchema?: Prisma.JsonValue;
  datasetExpectedOutputSchema?: Prisma.JsonValue;
}

type DatasetFormProps =
  | CreateDatasetFormProps
  | UpdateDatasetFormProps
  | DeleteDatasetFormProps;

// Validation schema for JSON Schema strings
export const jsonSchemaStringValidator = z.string().refine(
  (value) => {
    if (value === "") return true; // Empty is valid (means no schema)

    try {
      const parsed = JSON.parse(value);

      return isValidJSONSchema(parsed);
    } catch {
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
      } catch {
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

export const DatasetForm = forwardRef<DatasetFormRef, DatasetFormProps>(
  (props, ref) => {
    const [formError, setFormError] = useState<string | null>(null);
    const [
      serverSideSchemaValidationErrors,
      setServerSideSchemaValidationErrors,
    ] = useState<ServerSideSchemaValidationErrors | null>(null);
    const capture = usePostHogClientCapture();
    const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");

    const inputSchemaString =
      props.mode === "update" && props.datasetInputSchema
        ? JSON.stringify(props.datasetInputSchema, null, 2)
        : "";
    const expectedOutputSchemaString =
      props.mode === "update" && props.datasetExpectedOutputSchema
        ? JSON.stringify(props.datasetExpectedOutputSchema, null, 2)
        : "";

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
              inputSchema: inputSchemaString,
              expectedOutputSchema: expectedOutputSchemaString,
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
    const updateMutation = api.datasets.updateDataset.useMutation();
    const deleteMutation = api.datasets.deleteDataset.useMutation();

    const allDatasets = api.datasets.allDatasetMeta.useQuery(
      { projectId: props.projectId },
      {
        enabled: props.mode === "create" || props.mode === "update",
      },
    );

    const allDatasetNames = useMemo(() => {
      return (
        allDatasets.data?.map((dataset) => ({ value: dataset.name })) ?? []
      );
    }, [allDatasets.data]);

    useUniqueNameValidation({
      currentName: form.watch("name"),
      allNames: allDatasetNames,
      form,
      errorMessage: "Dataset name already exists.",
      whitelistedName: props.mode === "update" ? props.datasetName : undefined,
    });

    // Track previous validation state to avoid redundant callbacks
    const prevValidationRef = useRef<{
      isValid: boolean;
      isSubmitting: boolean;
    } | null>(null);

    // Report validation state to parent (only when values actually change)
    const { onValidationChange, mode } = props;
    useEffect(() => {
      if (onValidationChange) {
        const isValid = form.formState.isValid && !form.formState.errors.name;
        const isSubmitting =
          (mode === "create" && createMutation.isPending) ||
          (mode === "update" && updateMutation.isPending) ||
          (mode === "delete" && deleteMutation.isPending);

        const prev = prevValidationRef.current;
        if (
          !prev ||
          prev.isValid !== isValid ||
          prev.isSubmitting !== isSubmitting
        ) {
          prevValidationRef.current = { isValid, isSubmitting };
          onValidationChange(isValid, isSubmitting);
        }
      }
    }, [
      form.formState.isValid,
      form.formState.errors.name,
      createMutation.isPending,
      updateMutation.isPending,
      deleteMutation.isPending,
      mode,
      onValidationChange,
    ]);

    // Expose submit method via ref for external triggering
    useImperativeHandle(
      ref,
      () => ({
        submit: () => {
          if (props.mode !== "delete") {
            form.handleSubmit(onSubmit)();
          }
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [props.mode],
    );

    function onSubmit(values: z.infer<typeof formSchema>) {
      // Parse schemas if they're not empty (tRPC expects objects for DatasetJSONSchema)
      const inputSchema =
        values.inputSchema === "" ? null : JSON.parse(values.inputSchema);
      const expectedOutputSchema =
        values.expectedOutputSchema === ""
          ? null
          : JSON.parse(values.expectedOutputSchema);

      const trimmedValues = {
        name: values.name.trim(),
        description:
          values.description !== "" ? values.description.trim() : null,
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
          .then((result) => {
            if (result.success) {
              // Success - navigate to dataset items
              void utils.datasets.invalidate();
              props.onCreateDatasetSuccess?.(result.dataset);
              props.onFormSuccess?.();
              form.reset();
              if (props.redirectOnSuccess !== false) {
                router.push(
                  `/project/${props.projectId}/datasets/${result.dataset.id}/items`,
                );
              }
            } else {
              // Validation failed - show errors
              setServerSideSchemaValidationErrors(result.validationErrors);
              setFormError(null);
            }
          })
          .catch((error: Error) => {
            // System error (not validation)
            setFormError(error.message);
            setServerSideSchemaValidationErrors(null);
            console.error(error);
          });
      } else if (props.mode === "update") {
        capture("datasets:update_form_submit");
        updateMutation
          .mutateAsync({
            ...trimmedValues,
            projectId: props.projectId,
            datasetId: props.datasetId,
          })
          .then((result) => {
            if (result.success) {
              // Success - close dialog
              void utils.datasets.invalidate();
              props.onFormSuccess?.();
              form.reset();
            } else {
              // Validation failed - show errors
              setServerSideSchemaValidationErrors(result.validationErrors);
              setFormError(null);
            }
          })
          .catch((error: Error) => {
            // System error (not validation)
            setFormError(error.message);
            setServerSideSchemaValidationErrors(null);
            console.error(error);
          });
      }
    }

    const handleDelete = (e: React.FormEvent) => {
      e.preventDefault();

      // helps with type safety
      if (props.mode !== "delete") return;

      if (deleteConfirmationInput !== props.datasetName) {
        setFormError(
          "Please type the correct dataset name to confirm deletion",
        );
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
          <DialogBody
            className={props.showFooter === false ? "p-0" : undefined}
          >
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
                      label="Input schema"
                      description="Validate dataset item inputs against a JSON Schema. All new and existing items must conform to this schema."
                      value={field.value}
                      onChange={field.onChange}
                      initialValue={inputSchemaString}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedOutputSchema"
                  render={({ field }) => (
                    <DatasetSchemaInput
                      label="Expected output schema"
                      description="Validate dataset item expected outputs against a JSON Schema. All new and existing items must conform to this schema."
                      value={field.value}
                      onChange={field.onChange}
                      initialValue={expectedOutputSchemaString}
                    />
                  )}
                />

                {/* Show validation errors inline with form */}
                {serverSideSchemaValidationErrors && (
                  <DatasetSchemaValidationError
                    projectId={props.projectId}
                    datasetId={
                      props.mode === "update" ? props.datasetId : "unknown"
                    }
                    errors={serverSideSchemaValidationErrors}
                  />
                )}
              </div>
            )}
          </DialogBody>
          {props.showFooter !== false && (
            <DialogFooter>
              <div className="flex w-full flex-col gap-4">
                <Button
                  type="submit"
                  variant={props.mode === "delete" ? "destructive" : "default"}
                  disabled={!!form.formState.errors.name}
                  loading={
                    (props.mode === "create" && createMutation.isPending) ||
                    (props.mode === "update" && updateMutation.isPending) ||
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
          )}
        </form>
      </Form>
    );
  },
);

DatasetForm.displayName = "DatasetForm";
