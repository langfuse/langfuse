import { api } from "@/src/utils/api";
import * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { CodeMirrorEditor } from "@/src/components/editor";
import { type RouterOutput } from "@/src/utils/types";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import type { Prisma } from "@langfuse/shared";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { JSONSchemaForm } from "@/src/components/json-schema-form";
import validator from "@rjsf/validator-ajv8";
import type { IChangeEvent } from "@rjsf/core";
import type { RJSFSchema } from "@rjsf/utils";
import { Label } from "@/src/components/ui/label";
import { parseJsonSafe } from "@/src/utils/json";
import { Code, FormInput } from "lucide-react";

type EditorMode = "json" | "form";

const formSchema = z.object({
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

type Dataset = {
  id: string;
  name: string;
  inputSchema: Prisma.JsonValue | null;
  expectedOutputSchema: Prisma.JsonValue | null;
};

export const EditDatasetItem = ({
  projectId,
  datasetItem,
  dataset,
}: {
  projectId: string;
  datasetItem: RouterOutput["datasets"]["itemById"];
  dataset: Dataset | null;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
      expectedOutput: "",
      metadata: "",
    },
  });

  const inputValue = form.watch("input");
  const expectedOutputValue = form.watch("expectedOutput");

  // Check if dataset has schemas
  const inputSchema = dataset?.inputSchema as RJSFSchema | null;
  const outputSchema = dataset?.expectedOutputSchema as RJSFSchema | null;
  const hasAnySchema = Boolean(inputSchema || outputSchema);

  // Editor mode state - default to form if schemas are available
  const [editorMode, setEditorMode] = useState<EditorMode>(
    hasAnySchema ? "form" : "json",
  );

  // State for form mode data
  const [inputFormData, setInputFormData] = useState<unknown>(() =>
    parseJsonSafe(inputValue),
  );
  const [outputFormData, setOutputFormData] = useState<unknown>(() =>
    parseJsonSafe(expectedOutputValue),
  );

  // Reset form when datasetItem changes
  useEffect(() => {
    if (datasetItem) {
      const inputStr = datasetItem.input
        ? JSON.stringify(datasetItem.input, null, 2)
        : "";
      const outputStr = datasetItem.expectedOutput
        ? JSON.stringify(datasetItem.expectedOutput, null, 2)
        : "";
      const metadataStr = datasetItem.metadata
        ? JSON.stringify(datasetItem.metadata, null, 2)
        : "";

      form.reset({
        input: inputStr,
        expectedOutput: outputStr,
        metadata: metadataStr,
      });

      // Also update form data state
      setInputFormData(datasetItem.input ?? undefined);
      setOutputFormData(datasetItem.expectedOutput ?? undefined);
      setHasChanges(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItem?.id]);

  // Update editor mode when schema availability changes
  useEffect(() => {
    if (hasAnySchema) {
      setEditorMode("form");
    } else {
      setEditorMode("json");
    }
  }, [hasAnySchema]);

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
      setHasChanges(true);
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
      setHasChanges(true);
      // Also update the underlying form value for validation
      const jsonString =
        e.formData !== undefined ? JSON.stringify(e.formData, null, 2) : "";
      form.setValue("expectedOutput", jsonString, { shouldValidate: true });
    },
    [form],
  );

  // Track if fields have been touched or modified
  const { touchedFields, dirtyFields } = form.formState;
  const hasInteractedWithInput = touchedFields.input || dirtyFields.input;
  const hasInteractedWithExpectedOutput =
    touchedFields.expectedOutput || dirtyFields.expectedOutput;

  // Create dataset array for validation hook
  const datasets = useMemo(() => {
    if (!dataset) return [];
    return [dataset];
  }, [dataset]);

  // Validate against dataset schemas
  const validation = useDatasetItemValidation(
    inputValue,
    expectedOutputValue,
    datasets,
  );

  // Filter validation errors by field
  const inputErrors = validation.errors.filter((e) => e.field === "input");
  const expectedOutputErrors = validation.errors.filter(
    (e) => e.field === "expectedOutput",
  );

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!datasetItem) return;

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

    updateDatasetItemMutation.mutate({
      projectId: projectId,
      datasetId: datasetItem.datasetId,
      datasetItemId: datasetItem.id,
      input: inputJson,
      expectedOutput: outputJson,
      metadata: values.metadata,
    });
    setHasChanges(false);
  }

  return (
    <div className="flex h-full flex-col">
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex h-full flex-col"
          onChange={() => setHasChanges(true)}
        >
          <div className="flex items-center justify-between gap-4">
            {/* Mode toggle - only show when schemas are available */}
            {hasAnySchema && (
              <Tabs
                value={editorMode}
                onValueChange={(value) => handleModeChange(value as EditorMode)}
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
            <div className="flex items-center gap-4">
              {formError ? (
                <p className="text-red text-center">
                  <span className="font-bold">Error:</span> {formError}
                </p>
              ) : null}
              <Button
                type="submit"
                loading={updateDatasetItemMutation.isPending}
                disabled={
                  !hasChanges ||
                  !hasAccess ||
                  (validation.hasSchemas && !validation.isValid)
                }
                variant={hasChanges ? "default" : "ghost"}
              >
                {hasChanges ? "Save changes" : "Saved"}
              </Button>
            </div>
          </div>
          <div className="mt-4 flex-1 overflow-auto">
            <div className="space-y-4">
              {editorMode === "form" && hasAnySchema ? (
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
                          disabled={!hasAccess}
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
                          disabled={!hasAccess}
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
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Input</FormLabel>
                          {dataset?.inputSchema && (
                            <DatasetSchemaHoverCard
                              schema={dataset.inputSchema}
                              schemaType="input"
                              showLabel
                            />
                          )}
                        </div>
                        <FormControl>
                          <CodeMirrorEditor
                            mode="json"
                            value={field.value}
                            onChange={(v) => {
                              setHasChanges(true);
                              field.onChange(v);
                            }}
                            editable={hasAccess}
                            minHeight={200}
                          />
                        </FormControl>
                        <FormMessage />
                        {validation.hasSchemas &&
                          inputErrors.length > 0 &&
                          hasInteractedWithInput && (
                            <DatasetItemFieldSchemaErrors
                              errors={inputErrors}
                              showDatasetName={false}
                            />
                          )}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedOutput"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <FormLabel>Expected output</FormLabel>
                          {dataset?.expectedOutputSchema && (
                            <DatasetSchemaHoverCard
                              schema={dataset.expectedOutputSchema}
                              schemaType="expectedOutput"
                              showLabel
                            />
                          )}
                        </div>
                        <FormControl>
                          <CodeMirrorEditor
                            mode="json"
                            value={field.value}
                            onChange={(v) => {
                              setHasChanges(true);
                              field.onChange(v);
                            }}
                            editable={hasAccess}
                            minHeight={200}
                          />
                        </FormControl>
                        <FormMessage />
                        {validation.hasSchemas &&
                          expectedOutputErrors.length > 0 &&
                          hasInteractedWithExpectedOutput && (
                            <DatasetItemFieldSchemaErrors
                              errors={expectedOutputErrors}
                              showDatasetName={false}
                            />
                          )}
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Metadata field - always shown as JSON editor */}
              <FormField
                control={form.control}
                name="metadata"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metadata</FormLabel>
                    <FormControl>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value}
                        onChange={(v) => {
                          setHasChanges(true);
                          field.onChange(v);
                        }}
                        editable={hasAccess}
                        minHeight={100}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};
