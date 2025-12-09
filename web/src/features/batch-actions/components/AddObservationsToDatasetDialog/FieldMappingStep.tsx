import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/src/components/ui/form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import {
  Plus,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "@/src/utils/api";
import type { FieldMappingStepProps, MappingConfig } from "./types";

const mappingSchema = z.object({
  inputMappings: z
    .array(
      z.object({
        sourceField: z.enum(["input", "output", "metadata"]),
        jsonPath: z.string().optional(),
        targetKey: z.string().optional(),
      }),
    )
    .min(1),
  expectedOutputMappings: z
    .array(
      z.object({
        sourceField: z.enum(["input", "output", "metadata"]),
        jsonPath: z.string().optional(),
        targetKey: z.string().optional(),
      }),
    )
    .optional(),
  metadataMappings: z
    .array(
      z.object({
        sourceField: z.enum(["input", "output", "metadata"]),
        jsonPath: z.string().optional(),
        targetKey: z.string().optional(),
      }),
    )
    .optional(),
});

type MappingFormValues = z.infer<typeof mappingSchema>;

export function FieldMappingStep(props: FieldMappingStepProps) {
  const {
    projectId,
    datasetId,
    selectedObservationIds,
    mappingConfig,
    onMappingChange,
  } = props;

  const [showInputAdvanced, setShowInputAdvanced] = useState(false);
  const [showOutputAdvanced, setShowOutputAdvanced] = useState(false);
  const [showMetadataAdvanced, setShowMetadataAdvanced] = useState(false);

  const form = useForm<MappingFormValues>({
    resolver: zodResolver(mappingSchema),
    defaultValues: mappingConfig,
  });

  const {
    fields: inputFields,
    append: appendInput,
    remove: removeInput,
  } = useFieldArray({
    control: form.control,
    name: "inputMappings",
  });

  const {
    fields: outputFields,
    append: appendOutput,
    remove: removeOutput,
  } = useFieldArray({
    control: form.control,
    name: "expectedOutputMappings",
  });

  const {
    fields: metadataFields,
    append: appendMetadata,
    remove: removeMetadata,
  } = useFieldArray({
    control: form.control,
    name: "metadataMappings",
  });

  // Get first observation for preview (only if not selectAll)
  const firstObservationId = selectedObservationIds[0];

  // Live validation query
  const validateMappingQuery =
    api.tableBatchAction.addToDataset.validateMapping.useQuery(
      {
        projectId,
        observationId: firstObservationId,
        traceId: "",
        datasetId,
        mapping: {
          inputMappings: form.watch("inputMappings"),
          expectedOutputMappings: form.watch("expectedOutputMappings"),
          metadataMappings: form.watch("metadataMappings"),
        },
      },
      {
        enabled: !!firstObservationId && !!datasetId,
      },
    );

  // Report changes back to parent
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (values.inputMappings) {
        onMappingChange(values as MappingConfig);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, onMappingChange]);

  const validationResult = validateMappingQuery.data;

  return (
    <div className="grid grid-cols-[2fr,1fr] gap-6 p-6">
      {/* Left: Configuration Sections */}
      <Form {...form}>
        <div className="space-y-4">
          {/* Dataset Item Input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Dataset Item Input *
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Default: Full observation input
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Collapsible
                open={showInputAdvanced}
                onOpenChange={setShowInputAdvanced}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    {showInputAdvanced ? (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronRight className="mr-1 h-4 w-4" />
                    )}
                    <span className="text-xs">Advanced mapping</span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {inputFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="space-y-2 rounded border bg-muted/30 p-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name={`inputMappings.${index}.sourceField`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                From Observation
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="input">Input</SelectItem>
                                  <SelectItem value="output">Output</SelectItem>
                                  <SelectItem value="metadata">
                                    Metadata
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`inputMappings.${index}.targetKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                Target Key
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  className="h-8"
                                  placeholder="Optional"
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`inputMappings.${index}.jsonPath`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">JSON Path</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-8 font-mono text-xs"
                                placeholder="$.messages[0].content"
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {inputFields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeInput(index)}
                          className="h-7"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendInput({ sourceField: "input" as const })
                    }
                    className="h-8"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add mapping
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Dataset Item Expected Output */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Dataset Item Expected Output
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {outputFields.length > 0
                  ? "Mapped"
                  : "Default: Full observation output"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Collapsible
                open={showOutputAdvanced}
                onOpenChange={setShowOutputAdvanced}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    {showOutputAdvanced ? (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronRight className="mr-1 h-4 w-4" />
                    )}
                    <span className="text-xs">Advanced mapping</span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {outputFields.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendOutput({ sourceField: "output" as const })
                      }
                      className="h-8"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add mapping
                    </Button>
                  )}
                  {outputFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="space-y-2 rounded border bg-muted/30 p-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name={`expectedOutputMappings.${index}.sourceField`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                From Observation
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="input">Input</SelectItem>
                                  <SelectItem value="output">Output</SelectItem>
                                  <SelectItem value="metadata">
                                    Metadata
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`expectedOutputMappings.${index}.targetKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                Target Key
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  className="h-8"
                                  placeholder="Optional"
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`expectedOutputMappings.${index}.jsonPath`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">JSON Path</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-8 font-mono text-xs"
                                placeholder="$.messages[0].content"
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOutput(index)}
                        className="h-7"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {outputFields.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendOutput({ sourceField: "output" as const })
                      }
                      className="h-8"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add mapping
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Dataset Item Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">
                Dataset Item Metadata
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {metadataFields.length > 0 ? "Mapped" : "Default: Not mapped"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Collapsible
                open={showMetadataAdvanced}
                onOpenChange={setShowMetadataAdvanced}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2">
                    {showMetadataAdvanced ? (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronRight className="mr-1 h-4 w-4" />
                    )}
                    <span className="text-xs">Advanced mapping</span>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {metadataFields.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendMetadata({ sourceField: "metadata" as const })
                      }
                      className="h-8"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add mapping
                    </Button>
                  )}
                  {metadataFields.map((field, index) => (
                    <div
                      key={field.id}
                      className="space-y-2 rounded border bg-muted/30 p-3"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <FormField
                          control={form.control}
                          name={`metadataMappings.${index}.sourceField`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                From Observation
                              </FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="input">Input</SelectItem>
                                  <SelectItem value="output">Output</SelectItem>
                                  <SelectItem value="metadata">
                                    Metadata
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`metadataMappings.${index}.targetKey`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                Target Key
                              </FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  className="h-8"
                                  placeholder="Optional"
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`metadataMappings.${index}.jsonPath`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">JSON Path</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-8 font-mono text-xs"
                                placeholder="$.user.id"
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMetadata(index)}
                        className="h-7"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {metadataFields.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        appendMetadata({ sourceField: "metadata" as const })
                      }
                      className="h-8"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add mapping
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </div>
      </Form>

      {/* Right: Preview */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Sample from first observation
          </p>
        </div>

        {validationResult?.validationErrors &&
        validationResult.validationErrors.length > 0 ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                {validationResult.validationErrors.map((error, i) => (
                  <p key={i} className="text-xs">
                    {error}
                  </p>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        ) : validationResult?.success ? (
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">Input</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-[10px]">
                  {JSON.stringify(
                    validationResult.preview.input ?? null,
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">
                  Expected Output
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-[10px]">
                  {JSON.stringify(
                    validationResult.preview.expectedOutput ?? null,
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium">Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-32 overflow-auto rounded bg-muted p-2 text-[10px]">
                  {JSON.stringify(
                    validationResult.preview.metadata ?? null,
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Loading preview...
          </p>
        )}
      </div>
    </div>
  );
}
