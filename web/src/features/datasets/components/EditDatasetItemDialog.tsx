import { api } from "@/src/utils/api";
import * as z from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState, useMemo } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { CodeMirrorEditor } from "@/src/components/editor";
import { DatasetSchemaHoverCard } from "./DatasetSchemaHoverCard";
import { useDatasetItemValidation } from "../hooks/useDatasetItemValidation";
import type { DatasetItemDomain, Prisma } from "@langfuse/shared";
import { DatasetItemFieldSchemaErrors } from "./DatasetItemFieldSchemaErrors";

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

type EditDatasetItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  datasetItem: DatasetItemDomain | null;
  dataset: Dataset | null;
};

export const EditDatasetItemDialog = ({
  open,
  onOpenChange,
  projectId,
  datasetItem,
  dataset,
}: EditDatasetItemDialogProps) => {
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

  useEffect(() => {
    if (datasetItem && open) {
      form.reset({
        input: datasetItem.input
          ? JSON.stringify(datasetItem.input, null, 2)
          : "",
        expectedOutput: datasetItem.expectedOutput
          ? JSON.stringify(datasetItem.expectedOutput, null, 2)
          : "",
        metadata: datasetItem.metadata
          ? JSON.stringify(datasetItem.metadata, null, 2)
          : "",
      });
      setHasChanges(false);
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItem?.id, open]);

  const inputValue = form.watch("input");
  const expectedOutputValue = form.watch("expectedOutput");

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
    onSuccess: () => {
      utils.datasets.invalidate();
      onOpenChange(false);
      setHasChanges(false);
    },
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    if (!!!datasetItem) return;
    updateDatasetItemMutation.mutate({
      projectId: projectId,
      datasetId: datasetItem.datasetId,
      datasetItemId: datasetItem.id,
      input: values.input,
      expectedOutput: values.expectedOutput,
      metadata: values.metadata,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit Dataset Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex h-full flex-col"
            onChange={() => setHasChanges(true)}
          >
            <DialogBody>
              {formError ? (
                <p className="mb-4 text-destructive">
                  <span className="font-bold">Error:</span> {formError}
                </p>
              ) : null}
              <div className="space-y-4">
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
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateDatasetItemMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={updateDatasetItemMutation.isPending}
                disabled={
                  !hasChanges ||
                  !hasAccess ||
                  (validation.hasSchemas && !validation.isValid)
                }
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
