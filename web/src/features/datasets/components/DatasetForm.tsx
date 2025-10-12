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
import { useMemo, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { CodeMirrorEditor } from "@/src/components/editor";
// import { type Prisma } from "@langfuse/shared";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Label } from "@/src/components/ui/label";
import { useRouter } from "next/router";
import { useUniqueNameValidation } from "@/src/hooks/useUniqueNameValidation";
import { DialogBody, DialogFooter } from "@/src/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface BaseDatasetFormProps {
  mode: "create" | "update" | "delete";
  projectId: string;
  onFormSuccess?: () => void;
  className?: string;
}

interface CreateDatasetFormProps extends BaseDatasetFormProps {
  mode: "create";
}

interface DeleteDatasetFormProps extends BaseDatasetFormProps {
  mode: "delete";
  datasetName: string;
  datasetId: string;
}

interface UpdateDatasetFormProps extends BaseDatasetFormProps {
  mode: "update";
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetMetadata?: any;
}

type DatasetFormProps =
  | CreateDatasetFormProps
  | UpdateDatasetFormProps
  | DeleteDatasetFormProps;

const createFormSchema = (t: (key: string) => string) =>
  z.object({
    name: z
      .string()
      .min(1, t("dataset.validation.inputRequired"))
      .refine((name) => name.trim().length > 0, {
        message: t("dataset.validation.inputShouldNotBeWhitespace"),
      }),
    description: z.string(),
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

export const DatasetForm = (props: DatasetFormProps) => {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const capture = usePostHogClientCapture();
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const form = useForm({
    resolver: zodResolver(createFormSchema(t)),
    defaultValues:
      props.mode === "update"
        ? {
            name: props.datasetName,
            description: props.datasetDescription ?? "",
            metadata: props.datasetMetadata
              ? JSON.stringify(props.datasetMetadata, null, 2)
              : "",
          }
        : {
            name: "",
            description: "",
            metadata: "",
          },
  });

  const utils = api.useUtils();
  const router = useRouter();
  const createMutation = api.datasets.createDataset.useMutation();
  const renameMutation = api.datasets.updateDataset.useMutation();
  const deleteMutation = api.datasets.deleteDataset.useMutation();

  const allDatasets = api.datasets.allDatasetMeta.useQuery(
    { projectId: props.projectId },
    {
      enabled: props.mode === "create" || props.mode === "update",
    },
  );

  const allDatasetNames = useMemo(() => {
    return (
      allDatasets.data?.map((dataset: any) => ({ value: dataset.name })) ?? []
    );
  }, [allDatasets.data]);

  useUniqueNameValidation({
    currentName: form.watch("name"),
    allNames: allDatasetNames,
    form,
    errorMessage: t("dataset.errors.datasetNameAlreadyExists"),
    whitelistedName: props.mode === "update" ? props.datasetName : undefined,
  });

  function onSubmit(values: z.infer<ReturnType<typeof createFormSchema>>) {
    const trimmedValues = {
      ...values,
      name: values.name.trim(),
      description: values.description !== "" ? values.description.trim() : null,
    };
    if (props.mode === "create") {
      capture("datasets:new_form_submit");
      createMutation
        .mutateAsync({
          ...trimmedValues,
          projectId: props.projectId,
        })
        .then((dataset) => {
          void utils.datasets.invalidate();
          props.onFormSuccess?.();
          form.reset();
          router.push(
            `/project/${props.projectId}/datasets/${dataset.id}/items`,
          );
        })
        .catch((error: Error) => {
          setFormError(error.message);
          console.error(error);
        });
    } else if (props.mode === "update") {
      capture("datasets:update_form_submit");
      renameMutation
        .mutateAsync({
          ...trimmedValues,
          projectId: props.projectId,
          datasetId: props.datasetId,
        })
        .then(() => {
          void utils.datasets.invalidate();
          props.onFormSuccess?.();
          form.reset();
        })
        .catch((error: Error) => {
          setFormError(error.message);
          console.error(error);
        });
    }
  }

  const handleDelete = (e: React.FormEvent) => {
    e.preventDefault();

    // helps with type safety
    if (props.mode !== "delete") return;

    if (deleteConfirmationInput !== props.datasetName) {
      setFormError(t("dataset.errors.pleaseTypeCorrectDatasetName"));
      return;
    }

    capture("datasets:delete_form_submit");
    deleteMutation
      .mutateAsync({
        projectId: props.projectId,
        datasetId: props.datasetId,
      })
      .then(() => {
        void utils.datasets.invalidate();
        props.onFormSuccess?.();
        form.reset();
      })
      .catch((error: Error) => {
        setFormError(error.message);
        console.error(error);
      });
  };

  return (
    <div>
      <Form {...form}>
        <form
          onSubmit={
            props.mode === "delete" ? handleDelete : form.handleSubmit(onSubmit)
          }
        >
          <DialogBody>
            {props.mode === "delete" ? (
              <div className="mb-8 grid w-full gap-1.5">
                <Label htmlFor="delete-confirmation">
                  {t("dataset.form.typeToConfirmDeletion", {
                    datasetName: props.datasetName,
                  })}
                </Label>
                <Input
                  id="delete-confirmation"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                />
              </div>
            ) : (
              <div className="mb-8 space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.labels.name")}</FormLabel>
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
                      <FormLabel>
                        {t("dataset.form.descriptionOptional")}
                      </FormLabel>
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
                      <FormLabel>
                        {t("dataset.form.metadataOptional")}
                      </FormLabel>
                      <FormControl>
                        <CodeMirrorEditor
                          mode="json"
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                          }}
                          minHeight="none"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <div className="flex flex-col gap-4">
              <Button
                type="submit"
                variant={props.mode === "delete" ? "destructive" : "default"}
                disabled={!!form.formState.errors.name}
                loading={
                  (props.mode === "create" && createMutation.isPending) ||
                  (props.mode === "delete" && deleteMutation.isPending)
                }
                className="w-full"
              >
                {t(`dataset.actions.${props.mode}Dataset`)}
              </Button>
              {formError && (
                <p className="mt-4 text-center text-sm text-red-500">
                  <span className="font-bold">{t("common.errors.error")}</span>{" "}
                  {formError}
                </p>
              )}
            </div>
          </DialogFooter>
        </form>
      </Form>
    </div>
  );
};
