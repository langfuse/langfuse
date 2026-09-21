/* eslint-disable @repo/no-style-props, @repo/no-null-render */
import { Button } from "@/src/components/ui/button";
import * as z from "zod";
import { safeRandomUUID } from "@/src/utils/safe-random-uuid";
import { zodResolver } from "@hookform/resolvers/zod";
import { type Control, useForm, useWatch } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { api } from "@/src/utils/api";
import { Plus } from "lucide-react";
import {
  useState,
  useMemo,
  useId,
  useRef,
  useCallback,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showErrorToast } from "@/src/features/notifications";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { CodeMirrorEditor } from "@/src/components/editor";
import { useMediaTagChips } from "@/src/components/editor/mediaTagWidget";
import { type Prisma } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import {
  useDatasetItemMediaUpload,
  type PendingMediaUpload,
} from "../hooks/useDatasetItemMediaUpload";
import {
  createMediaDropPasteExtension,
  DatasetItemFieldToolbar,
  DatasetItemFormMediaAttachments,
  insertMediaReferenceAtCursor,
} from "./DatasetItemMediaAttachments";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";
import { generateSchemaExample } from "../lib/generateSchemaExample";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import {
  DatasetItemEditorLayout,
  DatasetItemPreviewField,
} from "./DatasetItemEditorLayout";
import {
  isValidDatasetJson,
  parseDatasetJson,
} from "../utils/parseDatasetJson";
import { DatasetForm } from "./DatasetForm";
import { submitDatasetItems } from "./submitDatasetItems";

const formSchema = z.object({
  datasetIds: z.array(z.string()).min(1, "Select at least one dataset"),
  input: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      return isValidDatasetJson(value);
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
});

type NewDatasetItemFormValues = z.infer<typeof formSchema>;

type DatasetWithSchema = {
  id: string;
  name: string;
  inputSchema: Prisma.JsonValue | null;
  expectedOutputSchema: Prisma.JsonValue | null;
};

const formatJsonValue = (value: Prisma.JsonValue | undefined): string => {
  if (value === undefined) return "";

  if (typeof value === "string") {
    try {
      // Parse the string and re-stringify with proper formatting
      const parsed = parseDatasetJson(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If it's not valid JSON, stringify the string itself
      return JSON.stringify(value, null, 2);
    }
  }
  return JSON.stringify(value, null, 2);
};

type NewDatasetItemFormProps = {
  projectId: string;
  traceId?: string;
  observationId?: string;
  input?: Prisma.JsonValue;
  output?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
  datasetId?: string;
  className?: string;
  onFormSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  currentDatasetId?: string;
};

const schemaFields = ["input", "expectedOutput"] as const;
type SchemaField = (typeof schemaFields)[number];

function hasSourceValues(props: NewDatasetItemFormProps) {
  return Boolean(props.input || props.output || props.metadata);
}

async function fillEmptySchemaFields({
  dataset,
  canFill,
  fill,
}: {
  dataset: DatasetWithSchema;
  canFill: (field: SchemaField) => boolean;
  fill: (field: SchemaField, value: string) => void;
}) {
  await Promise.all(
    schemaFields.map(async (field) => {
      const schema =
        field === "input" ? dataset.inputSchema : dataset.expectedOutputSchema;
      if (!schema || !canFill(field)) return;
      const example = await generateSchemaExample(schema);
      if (example && canFill(field)) fill(field, example);
    }),
  );
}

async function prepareInitialValues(
  props: NewDatasetItemFormProps,
  datasets: DatasetWithSchema[],
): Promise<NewDatasetItemFormValues> {
  const values = {
    datasetIds: props.datasetId ? [props.datasetId] : [],
    input: formatJsonValue(props.input),
    expectedOutput: formatJsonValue(props.output),
    metadata: formatJsonValue(props.metadata),
  };
  const dataset = datasets.find(({ id }) => id === props.datasetId);
  if (dataset && !hasSourceValues(props)) {
    await fillEmptySchemaFields({
      dataset,
      canFill: (field) => !values[field],
      fill: (field, value) => {
        values[field] = value;
      },
    });
  }
  return values;
}

export function NewDatasetItemForm(props: NewDatasetItemFormProps) {
  const [source] = useState(props);
  const formId = useId();
  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId: source.projectId,
  });
  // Initial examples belong to this form instance. Metadata refetches must not
  // seed its editable values again, including values the user has cleared.
  const initialValues = useQuery({
    queryKey: ["dataset-item-form-defaults", formId],
    queryFn: () => prepareInitialValues(source, datasets.data ?? []),
    enabled: datasets.data !== undefined,
    staleTime: Infinity,
    gcTime: 0,
  });

  if (datasets.isError && !datasets.data) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p>Datasets could not be loaded.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => datasets.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!initialValues.data) return <Skeleton className="h-72 w-full" />;

  return (
    <InitializedNewDatasetItemForm
      {...source}
      initialValues={initialValues.data}
      datasets={datasets.data ?? []}
    />
  );
}

function InitializedNewDatasetItemForm({
  initialValues,
  datasets: queriedDatasets,
  ...props
}: NewDatasetItemFormProps & {
  initialValues: NewDatasetItemFormValues;
  datasets: DatasetWithSchema[];
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"item" | "create">("item");
  const [createdDatasets, setCreatedDatasets] = useState<DatasetWithSchema[]>(
    [],
  );
  const datasets = [
    ...queriedDatasets,
    ...createdDatasets.filter(
      (created) =>
        !queriedDatasets.some((dataset) => dataset.id === created.id),
    ),
  ];
  const [isPending, setPending] = useState(false);
  const submissionOwner = useRef({ pending: false });
  const capture = usePostHogClientCapture();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
  });
  const editedFields = useRef(new Set<SchemaField>());
  const selectionVersion = useRef(0);

  // Only `datasetIds` is watched at the form level: it changes on dataset
  // selection (rare), not per keystroke. The input/expectedOutput/metadata
  // values are read via `useWatch` inside the isolated child components below
  // (validation, attachments, submit button) so typing in an editor doesn't
  // re-render the whole form and every other editor.
  const selectedDatasetIds = form.watch("datasetIds");
  const selectedDatasetCount = selectedDatasetIds.length;

  // Items don't exist until submit, so generate a stable id per selected
  // dataset up front; createMany writes each item with its id, so media
  // declared during editing is claimed. The upload `field` is cosmetic — the
  // dataset service derives the real field from the item JSON on write.
  const itemIdByDataset = useRef(new Map<string, string>());
  const getDatasetItemId = useCallback((datasetId: string) => {
    const existing = itemIdByDataset.current.get(datasetId);
    if (existing) return existing;
    const id = safeRandomUUID();
    itemIdByDataset.current.set(datasetId, id);
    return id;
  }, []);
  const uploadDatasetId = selectedDatasetIds[0] ?? "";
  const { uploadFile, pendingUploads } = useDatasetItemMediaUpload({
    projectId: props.projectId,
    datasetId: uploadDatasetId,
    datasetItemId: uploadDatasetId ? getDatasetItemId(uploadDatasetId) : "",
  });
  const inputEditorRef = useRef<ReactCodeMirrorRef>(null);
  const expectedOutputEditorRef = useRef<ReactCodeMirrorRef>(null);
  const metadataEditorRef = useRef<ReactCodeMirrorRef>(null);

  const uploadMedia = useCallback(
    async (file: File): Promise<string | null> => {
      if (submissionOwner.current.pending) return null;
      if (!uploadDatasetId) {
        showErrorToast(
          "Select a dataset first",
          "Choose a dataset before attaching media.",
        );
        return null;
      }
      return uploadFile(file, "input");
    },
    [uploadDatasetId, uploadFile],
  );

  const handleFileUpload =
    (editorRef: RefObject<ReactCodeMirrorRef | null>) => async (file: File) => {
      const referenceString = await uploadMedia(file);
      if (referenceString)
        insertMediaReferenceAtCursor(editorRef, referenceString);
    };

  // Shared across all three editors: drop/paste uploads the file and inserts
  // its reference into whichever editor fired the event. `uploadMedia` is a
  // fresh reference each render, so route it through a ref to build the
  // extension once and avoid reconfiguring CodeMirror on every keystroke.
  const uploadFileRef = useRef(uploadMedia);
  uploadFileRef.current = uploadMedia;
  const { extension: mediaChipExtension, portals: mediaChipPortals } =
    useMediaTagChips();
  const mediaDropPasteExtensions = useMemo(
    () => [
      mediaChipExtension,
      createMediaDropPasteExtension({
        onUploadMedia: (file) => uploadFileRef.current(file),
      }),
    ],
    [mediaChipExtension],
  );

  const hasInitialValues = hasSourceValues(props);

  // Track if fields have been touched or modified
  const { touchedFields, dirtyFields } = form.formState;
  const hasInteractedWithInput = touchedFields.input || dirtyFields.input;
  const hasInteractedWithExpectedOutput =
    touchedFields.expectedOutput || dirtyFields.expectedOutput;

  const selectedDatasets = datasets.filter((dataset) =>
    selectedDatasetIds.includes(dataset.id),
  );

  // Check if any selected dataset has schemas
  const hasInputSchema = selectedDatasets.some((d) => d.inputSchema);
  const hasOutputSchema = selectedDatasets.some((d) => d.expectedOutputSchema);

  function selectDatasets(datasetIds: string[]) {
    const version = ++selectionVersion.current;
    if (hasInitialValues || datasetIds.length !== 1) return;
    const dataset = datasets.find(({ id }) => id === datasetIds[0]);
    if (!dataset) return;
    return fillEmptySchemaFields({
      dataset,
      canFill: (field) =>
        version === selectionVersion.current &&
        !editedFields.current.has(field) &&
        !form.getValues(field),
      fill: (field, value) => form.setValue(field, value),
    });
  }

  const utils = api.useUtils();
  const createManyDatasetItemsMutation =
    api.datasets.createManyDatasetItems.useMutation({
      onSuccess: () => utils.datasets.invalidate(),
    });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (submissionOwner.current.pending || pendingUploads.length) return;
    if (props.traceId) {
      capture("dataset_item:new_from_trace_form_submit", {
        object: props.observationId ? "observation" : "trace",
      });
    } else {
      capture("dataset_item:new_form_submit");
    }

    return submitDatasetItems({
      owner: submissionOwner.current,
      input: {
        projectId: props.projectId,
        items: values.datasetIds.map((datasetId) => ({
          id: getDatasetItemId(datasetId),
          datasetId,
          input: values.input,
          expectedOutput: values.expectedOutput,
          metadata: values.metadata,
          sourceTraceId: props.traceId,
          sourceObservationId: props.observationId,
        })),
      },
      submit: createManyDatasetItemsMutation.mutateAsync,
      onPendingChange: (pending) => {
        setPending(pending);
        props.onPendingChange?.(pending);
      },
      onSuccess: () => {
        selectionVersion.current += 1;
        editedFields.current.clear();
        form.reset();
        props.onFormSuccess?.();
      },
      onError: setFormError,
    });
  }

  if (screen === "create") {
    return (
      <DatasetForm
        projectId={props.projectId}
        mode="create"
        redirectOnSuccess={false}
        onSubmittingChange={props.onPendingChange}
        onCancel={() => setScreen("item")}
        onCreateDatasetSuccess={(dataset) => {
          const created = {
            ...dataset,
            inputSchema: dataset.inputSchema as Prisma.JsonValue | null,
            expectedOutputSchema:
              dataset.expectedOutputSchema as Prisma.JsonValue | null,
          };
          setCreatedDatasets((current) => [...current, created]);
          const ids = [
            ...new Set([...form.getValues("datasetIds"), dataset.id]),
          ];
          form.setValue("datasetIds", ids, { shouldValidate: true });
          selectionVersion.current += 1;
          setScreen("item");
        }}
      />
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          if (submissionOwner.current.pending) {
            event.preventDefault();
            return;
          }
          return form.handleSubmit(onSubmit)(event);
        }}
        className={cn("flex h-full min-h-0 flex-col", props.className)}
      >
        <DialogBody className="min-h-0 overflow-hidden p-0">
          <DatasetItemEditorLayout
            preview={<FormPreview control={form.control} />}
            previewDescription="Review the values that will be added to each selected dataset."
            selector={
              <div className="flex items-end gap-2">
                <FormField
                  control={form.control}
                  name="datasetIds"
                  render={({ field }) => (
                    <FormItem className="flex min-w-0 flex-1 flex-col">
                      <FormLabel>Target datasets</FormLabel>
                      <FormControl>
                        <MultiSelectTagInput
                          aria-label="Target datasets"
                          disabled={isPending}
                          value={field.value}
                          options={datasets.map((dataset) => ({
                            value: dataset.id,
                            label: dataset.name,
                            optionSuffix:
                              dataset.id === props.currentDatasetId ? (
                                <span className="text-muted-foreground">
                                  (current)
                                </span>
                              ) : undefined,
                          }))}
                          onValueChange={(datasetIds) => {
                            field.onChange(datasetIds);
                            selectDatasets(datasetIds);
                          }}
                          placeholder="Select datasets"
                          searchPlaceholder="Search datasets..."
                          emptyMessage="No datasets found."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || pendingUploads.length > 0}
                  onClick={() => setScreen("create")}
                >
                  <Plus className="size-4" />
                  Create dataset
                </Button>
              </div>
            }
          >
            <FormField
              control={form.control}
              name="input"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <FormLabel>Input</FormLabel>
                    {hasInputSchema &&
                      selectedDatasets
                        .filter((d) => d.inputSchema)
                        .map((dataset) => (
                          <DatasetSchemaHoverCard
                            key={dataset.id}
                            schema={dataset.inputSchema!}
                            schemaType="input"
                            showLabel
                          />
                        ))[0]}
                    <DatasetItemFieldToolbar
                      copyValue={field.value}
                      disabled={isPending}
                      onSelectFile={handleFileUpload(inputEditorRef)}
                    />
                  </div>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
                      editable={!isPending}
                      value={field.value}
                      onChange={(value) => {
                        editedFields.current.add("input");
                        field.onChange(value);
                      }}
                      editorRef={inputEditorRef}
                      minHeight={140}
                      extensions={mediaDropPasteExtensions}
                      placeholder={`{
  "question": "What is the capital of England?"
}`}
                    />
                  </FormControl>
                  <FormMessage />
                  <FieldSchemaErrors
                    field="input"
                    value={field.value}
                    datasets={selectedDatasets}
                    show={hasInitialValues || !!hasInteractedWithInput}
                  />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expectedOutput"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <FormLabel>Expected output</FormLabel>
                    {hasOutputSchema &&
                      selectedDatasets
                        .filter((d) => d.expectedOutputSchema)
                        .map((dataset) => (
                          <DatasetSchemaHoverCard
                            key={dataset.id}
                            schema={dataset.expectedOutputSchema!}
                            schemaType="expectedOutput"
                            showLabel
                          />
                        ))[0]}
                    <DatasetItemFieldToolbar
                      copyValue={field.value}
                      disabled={isPending}
                      onSelectFile={handleFileUpload(expectedOutputEditorRef)}
                    />
                  </div>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
                      editable={!isPending}
                      value={field.value}
                      onChange={(value) => {
                        editedFields.current.add("expectedOutput");
                        field.onChange(value);
                      }}
                      editorRef={expectedOutputEditorRef}
                      minHeight={140}
                      extensions={mediaDropPasteExtensions}
                      placeholder={`{
  "answer": "London"
}`}
                    />
                  </FormControl>
                  <FormMessage />
                  <FieldSchemaErrors
                    field="expectedOutput"
                    value={field.value}
                    datasets={selectedDatasets}
                    show={hasInitialValues || !!hasInteractedWithExpectedOutput}
                  />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <FormLabel>Metadata</FormLabel>
                    <DatasetItemFieldToolbar
                      copyValue={field.value}
                      disabled={isPending}
                      onSelectFile={handleFileUpload(metadataEditorRef)}
                    />
                  </div>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
                      editable={!isPending}
                      value={field.value}
                      onChange={field.onChange}
                      editorRef={metadataEditorRef}
                      minHeight={100}
                      extensions={mediaDropPasteExtensions}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormMediaAttachments
              control={form.control}
              pendingUploads={pendingUploads}
            />
          </DatasetItemEditorLayout>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-col gap-4">
            <AddItemsButton
              control={form.control}
              datasets={selectedDatasets}
              selectedDatasetCount={selectedDatasetCount}
              isPending={isPending}
              pendingUploads={pendingUploads}
            />
            {formError ? (
              <p className="mt-2 text-center">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
          </div>
        </DialogFooter>
        {mediaChipPortals}
      </form>
    </Form>
  );
}

function FormPreview({
  control,
}: {
  control: Control<NewDatasetItemFormValues>;
}) {
  const values = useWatch({
    control,
    name: ["input", "expectedOutput", "metadata"],
  });
  return (
    <>
      {["Input", "Expected output", "Metadata"].map((label, index) => {
        const value = values[index] ?? "";
        const valid = isValidDatasetJson(value);
        return (
          <DatasetItemPreviewField
            key={label}
            label={label}
            value={valid ? parseDatasetJson(value) : undefined}
            feedback={
              !valid && (
                <p className="text-destructive border-t px-3 py-2 text-xs">
                  Enter valid JSON to preview this field.
                </p>
              )
            }
          />
        );
      })}
    </>
  );
}

/**
 * Per-field schema error display, isolated so it re-renders from its own
 * `value` (the editor's current value) rather than a form-level `watch`.
 * Validating each field independently means an invalid sibling field no longer
 * suppresses this field's schema errors.
 */
const FieldSchemaErrors = ({
  field,
  value,
  datasets,
  show,
}: {
  field: "input" | "expectedOutput";
  value: string;
  datasets: DatasetWithSchema[];
  show: boolean;
}) => {
  const validation = useDatasetItemValidation(
    field === "input" ? value : "",
    field === "expectedOutput" ? value : "",
    datasets,
  );
  const fieldErrors = validation.errors.filter((e) => e.field === field);

  if (!validation.hasSchemas || fieldErrors.length === 0 || !show) return null;

  return (
    <DatasetItemFieldSchemaErrors
      errors={fieldErrors}
      showDatasetName={datasets.length > 1}
    />
  );
};

/**
 * Attachment section subscribed to the live field values via `useWatch` so only
 * this section (not the editors) re-renders as the user types.
 */
const FormMediaAttachments = ({
  control,
  pendingUploads,
}: {
  control: Control<NewDatasetItemFormValues>;
  pendingUploads?: PendingMediaUpload[];
}) => {
  const [input, expectedOutput, metadata] = useWatch({
    control,
    name: ["input", "expectedOutput", "metadata"],
  });

  return (
    <DatasetItemFormMediaAttachments
      jsonStrings={[input, expectedOutput, metadata]}
      pendingUploads={pendingUploads}
    />
  );
};

/**
 * Submit button isolated so schema validation (dependent on the live field
 * values) re-renders only the button as the user types, not the editors.
 */
const AddItemsButton = ({
  control,
  datasets,
  selectedDatasetCount,
  isPending,
  pendingUploads,
}: {
  control: Control<NewDatasetItemFormValues>;
  datasets: DatasetWithSchema[];
  selectedDatasetCount: number;
  isPending: boolean;
  pendingUploads: PendingMediaUpload[];
}) => {
  const [input, expectedOutput] = useWatch({
    control,
    name: ["input", "expectedOutput"],
  });
  const validation = useDatasetItemValidation(input, expectedOutput, datasets);

  return (
    <Button
      type="submit"
      loading={isPending}
      // Block submit while uploads are in flight: the media reference is only
      // inserted into the form value after the upload resolves, so submitting
      // early would persist the item without the attachment and orphan the
      // uploaded bytes on S3.
      disabled={
        selectedDatasetCount === 0 ||
        (validation.hasSchemas && !validation.isValid) ||
        pendingUploads.length > 0
      }
    >
      Add
      {selectedDatasetCount > 1
        ? ` to ${selectedDatasetCount} datasets`
        : " to dataset"}
    </Button>
  );
};
