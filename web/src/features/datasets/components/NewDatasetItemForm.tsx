import { Button } from "@/src/components/ui/button";
import * as z from "zod/v4";
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
import { useState, useMemo, useEffect, useCallback } from "react";
import { CodeMirrorEditor } from "@/src/components/editor";
import { type Prisma } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
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
import { Check, ChevronsUpDown, Code, FormInput } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Label } from "@/src/components/ui/label";
import { JSONSchemaForm } from "@/src/components/json-schema-form";
import { parseJsonSafe } from "@/src/utils/json";
import validator from "@rjsf/validator-ajv8";
import type { IChangeEvent } from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";

type EditorMode = "json" | "form";

const formSchema = z.object({
  datasetIds: z.array(z.string()).min(1, "Select at least one dataset"),
  input: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (_error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (_error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
  metadata: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (_error) {
        return false;
      }
    },
    {
      message:
        "Invalid input. Please provide a JSON object or double-quoted string.",
    },
  ),
});

const formatJsonValue = (value: Prisma.JsonValue | undefined): string => {
  if (value === undefined) return "";

  if (typeof value === "string") {
    try {
      // Parse the string and re-stringify with proper formatting
      const parsed = JSON.parse(value);
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

  const selectedDatasetIds = form.watch("datasetIds");
  const selectedDatasetCount = selectedDatasetIds.length;
  const inputValue = form.watch("input");
  const expectedOutputValue = form.watch("expectedOutput");

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

  // Validate against all selected dataset schemas
  const validation = useDatasetItemValidation(
    inputValue,
    expectedOutputValue,
    selectedDatasets,
  );

  // Check if any selected dataset has schemas
  const hasInputSchema = selectedDatasets.some((d) => d.inputSchema);
  const hasOutputSchema = selectedDatasets.some((d) => d.expectedOutputSchema);
  const hasAnySchema = hasInputSchema || hasOutputSchema;

  // Get the unified schema for single dataset selection (form mode only works well with single dataset)
  const singleDataset =
    selectedDatasets.length === 1 ? selectedDatasets[0] : null;
  const inputSchema = singleDataset?.inputSchema as RJSFSchema | null;
  const outputSchema = singleDataset?.expectedOutputSchema as RJSFSchema | null;

  // Editor mode state - default to form if schemas are available and single dataset selected
  const [editorMode, setEditorMode] = useState<EditorMode>("json");

  // Update mode when dataset selection changes
  useEffect(() => {
    if (singleDataset && (inputSchema || outputSchema) && !hasInitialValues) {
      setEditorMode("form");
    } else {
      setEditorMode("json");
    }
  }, [singleDataset, inputSchema, outputSchema, hasInitialValues]);

  // State for form mode data
  const [inputFormData, setInputFormData] = useState<unknown>(() =>
    parseJsonSafe(inputValue),
  );
  const [outputFormData, setOutputFormData] = useState<unknown>(() =>
    parseJsonSafe(expectedOutputValue),
  );

  // Sync form data with JSON values when switching modes
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (newMode === "form" && editorMode === "json") {
        // Switching from JSON to Form - parse current JSON values
        setInputFormData(parseJsonSafe(inputValue));
        setOutputFormData(parseJsonSafe(expectedOutputValue));
      } else if (newMode === "json" && editorMode === "form") {
        // Switching from Form to JSON - stringify form data
        if (inputFormData !== undefined) {
          form.setValue("input", JSON.stringify(inputFormData, null, 2), {
            shouldValidate: true,
          });
        }
        if (outputFormData !== undefined) {
          form.setValue(
            "expectedOutput",
            JSON.stringify(outputFormData, null, 2),
            { shouldValidate: true },
          );
        }
      }
      setEditorMode(newMode);
    },
    [
      editorMode,
      inputValue,
      expectedOutputValue,
      inputFormData,
      outputFormData,
      form,
    ],
  );

  // Handle JSONSchemaForm changes
  const handleInputFormChange = useCallback(
    (e: IChangeEvent) => {
      setInputFormData(e.formData);
      // Also update the underlying form value for validation
      const jsonString =
        e.formData !== undefined ? JSON.stringify(e.formData, null, 2) : "";
      form.setValue("input", jsonString, { shouldValidate: true });
    },
    [form],
  );

  const handleOutputFormChange = useCallback(
    (e: IChangeEvent) => {
      setOutputFormData(e.formData);
      // Also update the underlying form value for validation
      const jsonString =
        e.formData !== undefined ? JSON.stringify(e.formData, null, 2) : "";
      form.setValue("expectedOutput", jsonString, { shouldValidate: true });
    },
    [form],
  );

  // Filter validation errors by field
  const inputErrors = validation.errors.filter((e) => e.field === "input");
  const expectedOutputErrors = validation.errors.filter(
    (e) => e.field === "expectedOutput",
  );

  // Generate placeholders from schema when dataset is selected
  useEffect(() => {
    // Only generate if form has no initial values
    if (hasInitialValues) return;

    // Only generate if single dataset selected
    if (selectedDatasets.length !== 1) return;

    const dataset = selectedDatasets[0];
    if (!dataset) return;

    // Only generate in JSON mode
    if (editorMode !== "json") return;

    // Generate input placeholder if schema exists and field is empty
    if (dataset.inputSchema && !inputValue) {
      const placeholder = generateSchemaExample(dataset.inputSchema);
      if (placeholder) {
        form.setValue("input", placeholder, {
          shouldValidate: false,
          shouldDirty: false,
          shouldTouch: false,
        });
      }
    }

    // Generate expectedOutput placeholder if schema exists and field is empty
    if (dataset.expectedOutputSchema && !expectedOutputValue) {
      const placeholder = generateSchemaExample(dataset.expectedOutputSchema);
      if (placeholder) {
        form.setValue("expectedOutput", placeholder, {
          shouldValidate: false,
          shouldDirty: false,
          shouldTouch: false,
        });
      }
    }
  }, [
    selectedDatasets,
    hasInitialValues,
    inputValue,
    expectedOutputValue,
    form,
    editorMode,
  ]);

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
    // If in form mode, ensure form data is synced to JSON values
    let inputJson = values.input;
    let outputJson = values.expectedOutput;

    if (editorMode === "form") {
      inputJson =
        inputFormData !== undefined
          ? JSON.stringify(inputFormData, null, 2)
          : "";
      outputJson =
        outputFormData !== undefined
          ? JSON.stringify(outputFormData, null, 2)
          : "";
    }

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
          input: inputJson,
          expectedOutput: outputJson,
          metadata: values.metadata,
          sourceTraceId: props.traceId,
          sourceObservationId: props.observationId,
        })),
      })
      .then((result) => {
        if (result.success) {
          props.onFormSuccess?.();
          form.reset();
          setInputFormData(undefined);
          setOutputFormData(undefined);

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

  // Check if form mode is available (single dataset with at least one schema)
  const canUseFormMode = singleDataset && hasAnySchema;

  return (
    <Form {...form}>
      <form
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("flex h-full flex-col gap-6", props.className)}
      >
        <DialogBody className="grid grid-rows-[auto,1fr]">
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
                                  <span className="ml-1 text-muted-foreground">
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
                            className="mb-1 mr-1"
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Mode toggle - only show when form mode is available */}
            {canUseFormMode && (
              <Tabs
                value={editorMode}
                onValueChange={(value) => handleModeChange(value as EditorMode)}
                className="mb-4"
              >
                <TabsList className="grid w-full max-w-xs grid-cols-2">
                  <TabsTrigger value="form" className="flex items-center gap-2">
                    <FormInput className="h-4 w-4" />
                    Form
                  </TabsTrigger>
                  <TabsTrigger value="json" className="flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    JSON
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {editorMode === "form" && canUseFormMode ? (
              // Form mode - render JSONSchemaForm components
              <div className="grid gap-4 md:grid-cols-2">
                {/* Input Form */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Input</Label>
                    {inputSchema && (
                      <DatasetSchemaHoverCard
                        schema={inputSchema}
                        schemaType="input"
                        showLabel
                      />
                    )}
                  </div>
                  {inputSchema ? (
                    <div className="rounded-md border bg-card p-4">
                      <JSONSchemaForm
                        schema={inputSchema}
                        validator={validator}
                        formData={inputFormData}
                        onChange={handleInputFormChange}
                        uiSchema={{
                          "ui:submitButtonOptions": { norender: true },
                        }}
                        liveValidate
                      >
                        <></>
                      </JSONSchemaForm>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      No input schema defined
                    </div>
                  )}
                </div>

                {/* Expected Output Form */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">
                      Expected output
                    </Label>
                    {outputSchema && (
                      <DatasetSchemaHoverCard
                        schema={outputSchema}
                        schemaType="expectedOutput"
                        showLabel
                      />
                    )}
                  </div>
                  {outputSchema ? (
                    <div className="rounded-md border bg-card p-4">
                      <JSONSchemaForm
                        schema={outputSchema}
                        validator={validator}
                        formData={outputFormData}
                        onChange={handleOutputFormChange}
                        uiSchema={{
                          "ui:submitButtonOptions": { norender: true },
                        }}
                        liveValidate
                      >
                        <></>
                      </JSONSchemaForm>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                      No expected output schema defined
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // JSON mode - render CodeMirrorEditor components (original behavior)
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
                      </div>
                      <FormControl>
                        <CodeMirrorEditor
                          mode="json"
                          value={field.value}
                          onChange={field.onChange}
                          minHeight={200}
                          placeholder={`{
  "question": "What is the capital of England?"
}`}
                        />
                      </FormControl>
                      <FormMessage />
                      {validation.hasSchemas &&
                        inputErrors.length > 0 &&
                        (hasInitialValues || hasInteractedWithInput) && (
                          <DatasetItemFieldSchemaErrors
                            errors={inputErrors}
                            showDatasetName={selectedDatasets.length > 1}
                          />
                        )}
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
                      </div>
                      <FormControl>
                        <CodeMirrorEditor
                          mode="json"
                          value={field.value}
                          onChange={field.onChange}
                          minHeight={200}
                          placeholder={`{
  "answer": "London"
}`}
                        />
                      </FormControl>
                      <FormMessage />
                      {validation.hasSchemas &&
                        expectedOutputErrors.length > 0 &&
                        (hasInitialValues ||
                          hasInteractedWithExpectedOutput) && (
                          <DatasetItemFieldSchemaErrors
                            errors={expectedOutputErrors}
                            showDatasetName={selectedDatasets.length > 1}
                          />
                        )}
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="metadata"
              render={({ field }) => (
                <FormItem className="mt-4 flex flex-col gap-2">
                  <FormLabel>Metadata</FormLabel>
                  <FormControl>
                    <CodeMirrorEditor
                      mode="json"
                      value={field.value}
                      onChange={field.onChange}
                      minHeight={100}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-col gap-4">
            <Button
              type="submit"
              loading={createManyDatasetItemsMutation.isPending}
              className="w-full"
              disabled={
                selectedDatasetCount === 0 ||
                (validation.hasSchemas && !validation.isValid)
              }
            >
              Add
              {selectedDatasetCount > 1
                ? ` to ${selectedDatasetCount} datasets`
                : " to dataset"}
            </Button>
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
