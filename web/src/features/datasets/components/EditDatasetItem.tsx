import { api } from "@/src/utils/api";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Textarea } from "@/src/components/ui/textarea";
import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { JsonForms } from "@jsonforms/react";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";

const formSchema = z.object({
  input: z.any(),
  expectedOutput: z.any(),
});

export const EditDatasetItem = ({
  projectId,
  datasetId,
  itemId,
}: {
  projectId: string;
  datasetId: string;
  itemId: string;
}) => {
  const [formError, setFormError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasAccess = useHasAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();
  const item = api.datasets.itemById.useQuery({
    datasetId,
    projectId,
    datasetItemId: itemId,
  });
  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const task = dataset.data?.task;

  useEffect(() => {
    form.setValue("input", item.data?.input);
    form.setValue("expectedOutput", item.data?.expectedOutput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.data]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
      expectedOutput: "",
    },
  });

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateDatasetItemMutation.mutate({
      projectId: projectId,
      datasetId: datasetId,
      datasetItemId: itemId,
      input: JSON.stringify(values.input, null, 2),
      expectedOutput: JSON.stringify(values.expectedOutput, null, 2),
    });
    setHasChanges(false);
  }

  return (
    <div>
      <Form {...form}>
        <form
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          onChange={() => setHasChanges(true)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input</FormLabel>
                  <FormControl>
                    {task ? (
                      <JsonForms
                        schema={task.inputSchema.schema as any}
                        data={field.value}
                        onChange={({ data }) => field.onChange(data)}
                        renderers={materialRenderers}
                        cells={materialCells}
                      />
                    ) : (
                      <Textarea
                        {...field}
                        value={
                          typeof field.value === "string"
                            ? field.value
                            : JSON.stringify(field.value, null, 2)
                        }
                        onChange={field.onChange}
                        className="min-h-[150px] flex-1 font-mono text-xs"
                      />
                    )}
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expectedOutput"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Expected output</FormLabel>
                    <FormControl>
                      {task ? (
                        <JsonForms
                          schema={task.outputSchema.schema as any}
                          data={field.value}
                          onChange={({ data }) => field.onChange(data)}
                          renderers={materialRenderers}
                          cells={materialCells}
                        />
                      ) : (
                        <Textarea
                          {...field}
                          value={
                            typeof field.value === "string"
                              ? field.value
                              : JSON.stringify(field.value, null, 2)
                          }
                          onChange={field.onChange}
                          className="min-h-[150px] flex-1 font-mono text-xs"
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              loading={updateDatasetItemMutation.isLoading}
              disabled={!hasChanges || !hasAccess}
              variant={hasChanges ? "default" : "ghost"}
            >
              {hasChanges ? "Save changes" : "Saved"}
            </Button>
          </div>
        </form>
      </Form>
      {formError ? (
        <p className="text-red text-center">
          <span className="font-bold">Error:</span> {formError}
        </p>
      ) : null}
    </div>
  );
};
