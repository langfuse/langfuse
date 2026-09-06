/* eslint-disable @repo/no-abstracted-overlay-trigger */
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight } from "lucide-react";
import * as z from "zod";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { LLMSchemaNameSchema } from "@/src/features/llm-schemas/validation";
import { api } from "@/src/utils/api";

import { JSONSchemaFormSchema, type LlmSchema } from "@langfuse/shared";
import { CodeMirrorEditor } from "@/src/components/editor";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useTranslations } from "next-intl";

const formSchema = z.object({
  name: LLMSchemaNameSchema,
  description: z.string().min(1),
  schema: JSONSchemaFormSchema,
});

type FormValues = z.infer<typeof formSchema>;

type CreateOrEditLLMSchemaDialog = {
  children: React.ReactNode;
  projectId: string;
  onSave: (llmSchema: LlmSchema) => void;
  onDelete?: (llmSchema: LlmSchema) => void;
  existingLlmSchema?: LlmSchema;
  defaultValues?: {
    name: string;
    description: string;
    schema: string;
  };
};

export const CreateOrEditLLMSchemaDialog: React.FC<
  CreateOrEditLLMSchemaDialog
> = (props) => {
  const t = useTranslations("coreDetails.playground.schemaDialog");
  const { children, projectId, onSave, existingLlmSchema } = props;

  const utils = api.useUtils();
  const createLlmSchema = api.llmSchemas.create.useMutation();
  const updateLlmSchema = api.llmSchemas.update.useMutation();
  const deleteLlmSchema = api.llmSchemas.delete.useMutation();

  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(
      formSchema.extend({
        description: z.string().min(1, t("descriptionRequired")),
      }),
    ),
    defaultValues: props.defaultValues ?? {
      name: "",
      description: "",
      schema: JSON.stringify(
        {
          type: "object",
          properties: {},
          required: [],
          additionalProperties: false,
        },
        null,
        2,
      ),
    },
  });

  // Populate form when in edit mode
  useEffect(() => {
    if (existingLlmSchema && !props.defaultValues) {
      form.reset({
        name: existingLlmSchema.name,
        description: existingLlmSchema.description,
        schema: JSON.stringify(existingLlmSchema.schema, null, 2),
      });
    }
  }, [existingLlmSchema, form, props.defaultValues]);

  async function onSubmit(values: FormValues) {
    let result;
    if (existingLlmSchema) {
      result = await updateLlmSchema.mutateAsync({
        id: existingLlmSchema.id,
        projectId,
        name: values.name,
        description: values.description,
        schema: JSON.parse(values.schema),
      });
    } else {
      result = await createLlmSchema.mutateAsync({
        projectId,
        name: values.name,
        description: values.description,
        schema: JSON.parse(values.schema),
      });
    }

    await utils.llmSchemas.getAll.invalidate({ projectId });

    onSave(result);
    setOpen(false);
  }

  async function handleDelete() {
    if (!existingLlmSchema) return;

    await deleteLlmSchema.mutateAsync({
      id: existingLlmSchema.id,
      projectId,
    });

    props.onDelete?.(existingLlmSchema);

    await utils.llmSchemas.getAll.invalidate({ projectId });
    setOpen(false);
  }

  const prettifyJson = () => {
    try {
      const currentValue = form.getValues("schema");
      const parsedJson = JSON.parse(currentValue);
      const prettified = JSON.stringify(parsedJson, null, 2);
      form.setValue("schema", prettified);
    } catch {
      showErrorToast(
        t("prettifyErrorTitle"),
        t("prettifyErrorDescription"),
        "WARNING",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex flex-col sm:min-w-128 md:min-w-160">
        <DialogHeader>
          <DialogTitle>
            {existingLlmSchema ? t("editTitle") : t("createTitle")}
          </DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();

              form.handleSubmit(onSubmit)();
            }}
            className="grid max-h-full min-h-0 overflow-hidden"
          >
            <DialogBody>
              <div className="flex-1 space-y-4 overflow-y-auto">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("namePlaceholder")} {...field} />
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
                      <FormLabel>{t("description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("descriptionPlaceholder")}
                          className="max-h-[120px] focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          {...field}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="schema"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("schema")}</FormLabel>
                      <FormDescription>
                        {t("schemaHelp")}{" "}
                        <a
                          href="https://json-schema.org/learn/miscellaneous-examples"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center"
                        >
                          {t("examples")}
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </FormDescription>
                      <FormControl>
                        <div className="relative flex flex-col gap-1">
                          <CodeMirrorEditor
                            value={field.value}
                            onChange={field.onChange}
                            mode="json"
                            minHeight={200}
                            className="max-h-[25vh]"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={prettifyJson}
                            className="absolute top-3 right-3 text-xs"
                          >
                            {t("prettify")}
                          </Button>
                        </div>
                      </FormControl>
                      <p className="text-muted-foreground text-xs">
                        {t("validSchema")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </DialogBody>

            <DialogFooter className="bg-modal sticky bottom-0 mt-4 flex flex-col gap-2 border-t pt-4">
              <div className="flex w-full flex-col gap-2">
                <p className="text-muted-foreground text-xs">
                  {t("projectNote")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  {existingLlmSchema && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      className="mr-auto"
                    >
                      {t("delete")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    {t("cancel")}
                  </Button>
                  <Button type="submit">{t("save")}</Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
