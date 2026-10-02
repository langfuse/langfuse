/* eslint-disable @repo/no-style-props */
import { Button } from "@/src/components/ui/button";
import * as z from "zod";
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
import { api, reportNonTrpcError } from "@/src/utils/api";
import { useMemo, useState, useRef } from "react";
import { Input } from "@/src/components/design-system/Input/Input";
import { CodeMirrorEditor } from "@/src/components/editor";
import {
  DatasetNameSchema,
  isValidJSONSchema,
  type Prisma,
} from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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

interface BaseDatasetFormProps {
  mode: "create" | "update";
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
  onSubmittingChange?: (pending: boolean) => void;
  onCancel?: () => void;
}

interface CreateDatasetFormProps extends BaseDatasetFormProps {
  mode: "create";
  folderPrefix?: string;
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

type DatasetFormProps = CreateDatasetFormProps | UpdateDatasetFormProps;

// Validation schema for JSON Schema strings
const jsonSchemaStringValidator = z.string().refine(
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

export const DatasetForm = (props: DatasetFormProps) => {
  const [pending, setPending] = useState(false);
  const submissionPending = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [
    serverSideSchemaValidationErrors,
    setServerSideSchemaValidationErrors,
  ] = useState<ServerSideSchemaValidationErrors | null>(null);
  const capture = usePostHogClientCapture();

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

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (submissionPending.current) return;
    submissionPending.current = true;
    setPending(true);
    props.onSubmittingChange?.(true);
    setFormError(null);
    setServerSideSchemaValidationErrors(null);
    // Parse schemas if they're not empty (tRPC expects objects for DatasetJSONSchema)
    const inputSchema =
      values.inputSchema === "" ? null : JSON.parse(values.inputSchema);
    const expectedOutputSchema =
      values.expectedOutputSchema === ""
        ? null
        : JSON.parse(values.expectedOutputSchema);

    const trimmedValues = {
      name: values.name.trim(),
      description: values.description !== "" ? values.description.trim() : null,
      // Keep metadata as string - resolveMetadata in tRPC will parse it
      metadata: values.metadata !== "" ? values.metadata : null,
      inputSchema,
      expectedOutputSchema,
    };

    let succeeded = false;
    let createdDataset:
      | Parameters<
          NonNullable<BaseDatasetFormProps["onCreateDatasetSuccess"]>
        >[0]
      | undefined;
    try {
      capture(
        props.mode === "create"
          ? "datasets:new_form_submit"
          : "datasets:update_form_submit",
      );
      const result =
        props.mode === "create"
          ? await createMutation.mutateAsync({
              ...trimmedValues,
              projectId: props.projectId,
            })
          : await updateMutation.mutateAsync({
              ...trimmedValues,
              projectId: props.projectId,
              datasetId: props.datasetId,
            });
      if (result.success) {
        succeeded = true;
        if (props.mode === "create") createdDataset = result.dataset;
        utils.datasets.invalidate();
        form.reset();
      } else {
        setServerSideSchemaValidationErrors(result.validationErrors);
      }
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Could not save the dataset. Please try again.",
      );
      reportNonTrpcError(error, "datasets");
    } finally {
      submissionPending.current = false;
      setPending(false);
      props.onSubmittingChange?.(false);
    }
    if (succeeded) {
      if (createdDataset) props.onCreateDatasetSuccess?.(createdDataset);
      props.onFormSuccess?.();
      if (createdDataset && props.redirectOnSuccess !== false) {
        router.push(
          `/project/${props.projectId}/datasets/${createdDataset.id}/items`,
        );
      }
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          if (submissionPending.current) {
            event.preventDefault();
            return;
          }
          return form.handleSubmit(onSubmit)(event);
        }}
        className="flex h-full min-h-0 flex-col"
      >
        <DialogBody className={props.showFooter === false ? "p-0" : undefined}>
          <fieldset disabled={pending} className="mb-8 min-w-0 space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormDescription>
                    Use slashes &apos;/&apos; in dataset names to organize them
                    into <em>folders</em>.
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
                      editable={!pending}
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
                  disabled={pending}
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
                  disabled={pending}
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
          </fieldset>
          {formError && (
            <p role="alert" className="text-destructive text-sm">
              {formError}
            </p>
          )}
        </DialogBody>
        {props.showFooter !== false && (
          <DialogFooter>
            {props.onCancel && (
              <Button
                variant="ghost"
                onClick={props.onCancel}
                disabled={pending}
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              disabled={!!form.formState.errors.name}
              loading={pending}
            >
              {props.mode === "create" ? "Create dataset" : "Update dataset"}
            </Button>
          </DialogFooter>
        )}
      </form>
    </Form>
  );
};
