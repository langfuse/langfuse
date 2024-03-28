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

const formSchema = z.object({
  input: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    { message: "Invalid JSON" },
  ),
  expectedOutput: z.string().refine(
    (value) => {
      if (value === "") return true;
      try {
        JSON.parse(value);
        return true;
      } catch (error) {
        return false;
      }
    },
    { message: "Invalid JSON" },
  ),
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

  useEffect(() => {
    form.setValue(
      "input",
      item.data?.input ? JSON.stringify(item.data.input, null, 2) : "",
    );
    form.setValue(
      "expectedOutput",
      item.data?.expectedOutput
        ? JSON.stringify(item.data.expectedOutput, null, 2)
        : "",
    );
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
      input: values.input,
      expectedOutput: values.expectedOutput,
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
                    <Textarea
                      {...field}
                      className="min-h-[200px] font-mono text-xs"
                      disabled={!hasAccess}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expectedOutput"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected output</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      className="min-h-[200px] font-mono text-xs"
                      disabled={!hasAccess}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
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
