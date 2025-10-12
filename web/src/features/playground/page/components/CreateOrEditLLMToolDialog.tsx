import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight } from "lucide-react";
import * as z from "zod/v4";
import { useTranslation } from "react-i18next";

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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { LLMToolNameSchema } from "@/src/features/llm-tools/validation";
import { api } from "@/src/utils/api";

import { CodeMirrorEditor } from "@/src/components/editor";
import { JSONSchemaFormSchema, type LlmTool } from "@langfuse/shared";

const createFormSchema = (t: (key: string) => string) =>
  z.object({
    name: LLMToolNameSchema,
    description: z
      .string()
      .min(1, t("playground.llmToolDialog.descriptionRequired")),
    parameters: JSONSchemaFormSchema,
  });

type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

type CreateOrEditLLMToolDialog = {
  children: React.ReactNode;
  projectId: string;
  onSave: (llmTool: LlmTool) => void;
  onDelete?: (llmTool: LlmTool) => void;
  existingLlmTool?: LlmTool;
  defaultValues?: {
    name: string;
    description: string;
    parameters: string;
  };
};

export const CreateOrEditLLMToolDialog: React.FC<CreateOrEditLLMToolDialog> = (
  props,
) => {
  const { t } = useTranslation();
  const { children, projectId, onSave, existingLlmTool } = props;

  const utils = api.useUtils();
  const createLlmTool = api.llmTools.create.useMutation();
  const updateLlmTool = api.llmTools.update.useMutation();
  const deleteLlmTool = api.llmTools.delete.useMutation();

  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(createFormSchema(t)),
    defaultValues: props.defaultValues ?? {
      name: "",
      description: "",
      parameters: JSON.stringify(
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
    if (existingLlmTool && !props.defaultValues) {
      form.reset({
        name: existingLlmTool.name,
        description: existingLlmTool.description,
        parameters: JSON.stringify(existingLlmTool.parameters, null, 2),
      });
    }
  }, [existingLlmTool, form, props.defaultValues]);

  async function onSubmit(values: FormValues) {
    let result;
    if (existingLlmTool) {
      result = await updateLlmTool.mutateAsync({
        id: existingLlmTool.id,
        projectId,
        name: values.name,
        description: values.description,
        parameters: JSON.parse(values.parameters),
      });
    } else {
      result = await createLlmTool.mutateAsync({
        projectId,
        name: values.name,
        description: values.description,
        parameters: JSON.parse(values.parameters),
      });
    }

    await utils.llmTools.getAll.invalidate({ projectId });

    onSave(result);
    setOpen(false);
  }

  async function handleDelete() {
    if (!existingLlmTool) return;

    await deleteLlmTool.mutateAsync({
      id: existingLlmTool.id,
      projectId,
    });

    props.onDelete?.(existingLlmTool);

    await utils.llmTools.getAll.invalidate({ projectId });
    setOpen(false);
  }

  const prettifyJson = () => {
    try {
      const currentValue = form.getValues("parameters");
      const parsedJson = JSON.parse(currentValue);
      const prettified = JSON.stringify(parsedJson, null, 2);
      form.setValue("parameters", prettified);
    } catch (error) {
      console.error("Failed to prettify JSON:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </DialogTrigger>
      <DialogContent
        className="flex flex-col sm:min-w-[32rem] md:min-w-[40rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {existingLlmTool
              ? t("playground.llmToolDialog.editLlmTool")
              : t("playground.llmToolDialog.createLlmTool")}
          </DialogTitle>
          <DialogDescription>
            {t("playground.llmToolDialog.defineToolForLlmFunctionCalling")}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid max-h-full min-h-0 overflow-hidden"
          >
            <DialogBody>
              <div className="flex-1 space-y-4 overflow-y-auto">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("common.labels.name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "playground.llmToolDialog.namePlaceholder",
                          )}
                          {...field}
                        />
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
                        {t("playground.llmToolDialog.description")}
                      </FormLabel>
                      <FormDescription>
                        {t("playground.llmToolDialog.descriptionHelper")}
                      </FormDescription>
                      <FormControl>
                        <Textarea
                          placeholder={t(
                            "playground.llmToolDialog.descriptionPlaceholder",
                          )}
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
                  name="parameters"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("playground.llmToolDialog.parameters")}
                      </FormLabel>
                      <FormDescription>
                        {t("playground.llmToolDialog.parametersDescription")}{" "}
                        <a
                          href="https://json-schema.org/learn/miscellaneous-examples"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center"
                        >
                          {t("playground.llmToolDialog.seeJsonSchemaExamples")}
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
                            className="absolute right-3 top-3 text-xs"
                          >
                            {t("playground.llmToolDialog.prettify")}
                          </Button>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "playground.llmToolDialog.parametersMustBeValidJson",
                        )}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </DialogBody>

            <DialogFooter className="sticky bottom-0 mt-4 flex flex-col gap-2 border-t bg-background pt-4">
              <div className="flex w-full flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {t("playground.llmToolDialog.noteChangesReflected")}
                </p>
                <div className="flex items-center justify-between gap-2">
                  {existingLlmTool && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      className="mr-auto"
                    >
                      {t("playground.llmToolDialog.delete")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                  >
                    {t("playground.llmToolDialog.cancel")}
                  </Button>
                  <Button type="submit">
                    {t("playground.llmToolDialog.save")}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
