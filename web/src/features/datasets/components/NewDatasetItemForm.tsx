import { Button } from "@/src/components/ui/button";
import * as z from "zod";
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
import { useState, useMemo, useEffect, useRef, type RefObject } from "react";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { CodeMirrorEditor } from "@/src/components/editor";
import { type Prisma } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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
import {
  InputCommand,
  InputCommandEmpty,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
} from "@/src/components/ui/input-command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import {
  isValidDatasetJson,
  parseDatasetJson,
} from "../utils/parseDatasetJson";

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
  currentDatasetId?: string;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      datasetIds: props.datasetId ? [props.datasetId] : [],
      input: formatJsonValue(props.input),
      expectedOutput: formatJsonValue(props.output),
      metadata: formatJsonValue(props.metadata),
    },
  });

  // Only `datasetIds` is watched at the form level: it changes on dataset
  // selection (rare), not per keystroke. The input/expectedOutput/metadata
  // values are read via `useWatch` inside the isolated child components below
  // (validation, attachments, submit button) so typing in an editor doesn't
  // re-render the whole form and every other editor.
  const selectedDatasetIds = form.watch("datasetIds");
  const selectedDatasetCount = selectedDatasetIds.length;

  const { uploadFile, pendingUploads } = useDatasetItemMediaUpload({
    projectId: props.projectId,
  });
  const inputEditorRef = useRef<ReactCodeMirrorRef>(null);
  const expectedOutputEditorRef = useRef<ReactCodeMirrorRef>(null);
  const metadataEditorRef = useRef<ReactCodeMirrorRef>(null);

  const handleFileUpload =
    (editorRef: RefObject<ReactCodeMirrorRef | null>) => async (file: File) => {
      const referenceString = await uploadFile(file);
      if (referenceString)
        insertMediaReferenceAtCursor(editorRef, referenceString);
    };

  // Shared across all three editors: drop/paste uploads the file and inserts
  // its reference into whichever editor fired the event. `uploadFile` is a
  // fresh reference each render, so route it through a ref to build the
  // extension once and avoid reconfiguring CodeMirror on every keystroke.
  const uploadFileRef = useRef(uploadFile);
  uploadFileRef.current = uploadFile;
  const mediaDropPasteExtensions = useMemo(
    () => [
      createMediaDropPasteExtension({
        onUploadMedia: (file) => uploadFileRef.current(file),
      }),
    ],
    [],
  );

  const hasInitialValues = Boolean(
    props.input || props.output || props.metadata,
  );

  // Track if fields have been touched or modified
  const { touchedFields, dirtyFields } = form.formState;
  const hasInteractedWithInput = touchedFields.input || dirtyFields.input;
  const hasInteractedWithExpectedOutput =
    touchedFields.expectedOutput || dirtyFields.expectedOutput;

  const datasets = api.datasets.allDatasetMeta.useQuery({
    projectId: props.projectId,
  });

  // Get selected datasets with their schemas
  const selectedDatasets = useMemo(() => {
    if (!datasets.data) return [];
    return datasets.data.filter((d) => selectedDatasetIds.includes(d.id));
  }, [datasets.data, selectedDatasetIds]);

  // Check if any selected dataset has schemas
  const hasInputSchema = selectedDatasets.some((d) => d.inputSchema);
  const hasOutputSchema = selectedDatasets.some((d) => d.expectedOutputSchema);

  // Generate placeholders from schema when dataset is selected
  useEffect(() => {
    // Only generate if form has no initial values
    if (hasInitialValues) return;

    // Only generate if single dataset selected
    if (selectedDatasets.length !== 1) return;

    const dataset = selectedDatasets[0];
    if (!dataset) return;

    let cancelled = false;

    // Generate input placeholder if schema exists and field is empty
    if (dataset.inputSchema && !form.getValues("input")) {
      generateSchemaExample(dataset.inputSchema).then((placeholder) => {
        if (!cancelled && placeholder && !form.getValues("input")) {
          form.setValue("input", placeholder, {
            shouldValidate: false,
            shouldDirty: false,
            shouldTouch: false,
          });
        }
      });
    }

    // Generate expectedOutput placeholder if schema exists and field is empty
    if (dataset.expectedOutputSchema && !form.getValues("expectedOutput")) {
      generateSchemaExample(dataset.expectedOutputSchema).then(
        (placeholder) => {
          if (!cancelled && placeholder && !form.getValues("expectedOutput")) {
            form.setValue("expectedOutput", placeholder, {
              shouldValidate: false,
              shouldDirty: false,
              shouldTouch: false,
            });
          }
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [selectedDatasets, hasInitialValues, form]);

  const utils = api.useUtils();
  const createManyDatasetItemsMutation =
    api.datasets.createManyDatasetItems.useMutation({
      onSuccess: () => utils.datasets.invalidate(),
      onError: (error) => {
        if (error.message.includes("Body exc")) {
          setFormError(
            "Data exceeds maximum size (4.5MB). Please attempt to create dataset item programmatically.",
          );
        } else {
          setFormError(error.message);
        }
      },
    });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (props.traceId) {
      capture("dataset_item:new_from_trace_form_submit", {
        object: props.observationId ? "observation" : "trace",
      });
    } else {
      capture("dataset_item:new_form_submit");
    }

    createManyDatasetItemsMutation
      .mutateAsync({
        projectId: props.projectId,
        items: values.datasetIds.map((datasetId) => ({
          datasetId,
          input: values.input,
          expectedOutput: values.expectedOutput,
          metadata: values.metadata,
          sourceTraceId: props.traceId,
          sourceObservationId: props.observationId,
        })),
      })
      .then((result) => {
        if (result.success) {
          props.onFormSuccess?.();
          form.reset();

          return;
        }

        setFormError(
          `Item does not match dataset schema. Errors: ${JSON.stringify(result.validationErrors, null, 2)}`,
        );
        console.error(result.validationErrors);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex h-full flex-col gap-6", props.className)}
      >
        <DialogBody className="grid grid-rows-[auto_1fr]">
          <div className="flex-none">
            <FormField
              control={form.control}
              name="datasetIds"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Target datasets</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value.length && "text-muted-foreground",
                          )}
                        >
                          {field.value.length > 0
                            ? `${field.value.length} dataset${field.value.length > 1 ? "s" : ""} selected`
                            : "Select datasets"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="p-0">
                      <InputCommand>
                        <InputCommandInput
                          placeholder="Search datasets..."
                          variant="bottom"
                        />
                        <InputCommandEmpty>
                          No datasets found.
                        </InputCommandEmpty>
                        <InputCommandGroup>
                          <ScrollArea className="h-fit">
                            {datasets.data?.map((dataset) => (
                              <InputCommandItem
                                value={dataset.name}
                                key={dataset.id}
                                onSelect={() => {
                                  const newValue = field.value.includes(
                                    dataset.id,
                                  )
                                    ? field.value.filter(
                                        (id) => id !== dataset.id,
                                      )
                                    : [...field.value, dataset.id];
                                  field.onChange(newValue);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value.includes(dataset.id)
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {dataset.name}
                                {dataset.id === props.currentDatasetId && (
                                  <span className="text-muted-foreground ml-1">
                                    (current)
                                  </span>
                                )}
                              </InputCommandItem>
                            ))}
                          </ScrollArea>
                        </InputCommandGroup>
                      </InputCommand>
                    </PopoverContent>
                  </Popover>
                  {field.value.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.value.map((datasetId) => {
                        const dataset = datasets.data?.find(
                          (d) => d.id === datasetId,
                        );
                        return (
                          <Badge
                            key={datasetId}
                            variant="secondary"
                            className="mr-1 mb-1"
                          >
                            {dataset?.name || datasetId}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="grid gap-4 md:grid-cols-2">
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
                        onSelectFile={handleFileUpload(inputEditorRef)}
                      />
                    </div>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={field.onChange}
                        editorRef={inputEditorRef}
                        minHeight={200}
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
                        onSelectFile={handleFileUpload(expectedOutputEditorRef)}
                      />
                    </div>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={field.onChange}
                        editorRef={expectedOutputEditorRef}
                        minHeight={200}
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
                      show={
                        hasInitialValues || !!hasInteractedWithExpectedOutput
                      }
                    />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <FormLabel>Metadata</FormLabel>
                    <DatasetItemFieldToolbar
                      copyValue={field.value}
                      onSelectFile={handleFileUpload(metadataEditorRef)}
                    />
                  </div>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
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
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-col gap-4">
            <AddItemsButton
              control={form.control}
              datasets={selectedDatasets}
              selectedDatasetCount={selectedDatasetCount}
              isPending={createManyDatasetItemsMutation.isPending}
              pendingUploads={pendingUploads}
            />
            {formError ? (
              <p className="text-red mt-2 text-center">
                <span className="font-bold">Error:</span> {formError}
              </p>
            ) : null}
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
};

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
      className="w-full"
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
