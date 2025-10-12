import { api } from "@/src/utils/api";
import * as z from "zod/v4";
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
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { CodeMirrorEditor } from "@/src/components/editor";
import { type RouterOutput } from "@/src/utils/types";
import { useTranslation } from "react-i18next";

const createFormSchema = (t: (key: string) => string) =>
  z.object({
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
      {
        message: t("dataset.validation.invalidInputJson"),
      },
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
      {
        message: t("dataset.validation.invalidInputJson"),
      },
    ),
    metadata: z.string().refine(
      (value) => {
        if (value === "") return true;
        try {
          JSON.parse(value);
          return true;
        } catch (error) {
          return false;
        }
      },
      {
        message: t("dataset.validation.invalidInputJson"),
      },
    ),
  });

export const EditDatasetItem = ({
  projectId,
  datasetItem,
}: {
  projectId: string;
  datasetItem: RouterOutput["datasets"]["itemById"];
}) => {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "datasets:CUD",
  });
  const utils = api.useUtils();

  useEffect(() => {
    if (datasetItem) {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetItem?.id]);

  const form = useForm({
    resolver: zodResolver(createFormSchema(t)),
    defaultValues: {
      input: "",
      expectedOutput: "",
      metadata: "",
    },
  });

  const updateDatasetItemMutation = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
    onError: (error) => setFormError(error.message),
  });

  function onSubmit(values: z.infer<ReturnType<typeof createFormSchema>>) {
    if (!!!datasetItem) return;
    updateDatasetItemMutation.mutate({
      projectId: projectId,
      datasetId: datasetItem.datasetId,
      datasetItemId: datasetItem.id,
      input: values.input,
      expectedOutput: values.expectedOutput,
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
          <div className="flex items-center justify-end gap-4">
            {formError ? (
              <p className="text-red text-center">
                <span className="font-bold">{t("common.errors.error")}</span>{" "}
                {formError}
              </p>
            ) : null}
            <Button
              type="submit"
              loading={updateDatasetItemMutation.isPending}
              disabled={!hasChanges || !hasAccess}
              variant={hasChanges ? "default" : "ghost"}
            >
              {hasChanges
                ? t("dataset.actions.saveChanges")
                : t("dataset.actions.saved")}
            </Button>
          </div>
          <div className="ph-no-capture flex-1 overflow-auto">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="input"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("dataset.form.input")}</FormLabel>
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
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expectedOutput"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("dataset.form.expectedOutput")}</FormLabel>
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
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="metadata"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dataset.form.metadata")}</FormLabel>
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
