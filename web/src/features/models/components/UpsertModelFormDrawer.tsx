import { MinusCircle, PlusCircle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod/v4";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  type FormUpsertModel,
  FormUpsertModelSchema,
  type GetModelResult,
} from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";

import { PricePreview } from "./PricePreview";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useTranslation } from "react-i18next";

type UpsertModelDrawerProps =
  | {
      action: "create";
      children: React.ReactNode;
      projectId: string;
      prefilledModelData?: {
        modelName?: string;
        prices?: Record<string, number>;
      };
      className?: string;
    }
  | {
      action: "edit" | "clone";
      children: React.ReactNode;
      projectId: string;
      modelData: GetModelResult;
      className?: string;
    };

export const UpsertModelFormDrawer = ({
  children,
  ...props
}: UpsertModelDrawerProps) => {
  const { t } = useTranslation();
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  let defaultValues: FormUpsertModel;
  if (props.action !== "create") {
    defaultValues = {
      modelName: props.modelData.modelName,
      matchPattern: props.modelData.matchPattern,
      tokenizerId: props.modelData.tokenizerId,
      tokenizerConfig: JSON.stringify(props.modelData.tokenizerConfig ?? {}),
      prices: props.modelData.prices,
    };
  } else {
    defaultValues = {
      modelName: props.prefilledModelData?.modelName ?? "",
      matchPattern: props.prefilledModelData?.modelName
        ? `(?i)^(${props.prefilledModelData?.modelName})$`
        : "",
      tokenizerId: null,
      tokenizerConfig: null,
      prices: props.prefilledModelData?.prices ?? {
        input: 0.000001,
        output: 0.000002,
      },
    };
  }

  const form = useForm({
    resolver: zodResolver(
      props.action === "edit"
        ? FormUpsertModelSchema.omit({ modelName: true }).extend({
            modelName: z.string().default(props.modelData.modelName),
          })
        : FormUpsertModelSchema,
    ),
    defaultValues,
  });
  const modelName = form.watch("modelName");
  const matchPattern = form.watch("matchPattern");
  const tokenizerId = form.watch("tokenizerId");

  // prefill match pattern if model name changes
  useEffect(() => {
    const getRegexString = (modelName: string) => `(?i)^(${modelName})$`;

    if (
      modelName &&
      (!matchPattern ||
        matchPattern === `(?i)^(${modelName.slice(0, -1)})$` ||
        matchPattern === `(?i)^(${modelName})$`)
    ) {
      form.setValue("matchPattern", getRegexString(modelName));
    }
  }, [modelName, matchPattern, form]);

  const upsertModelMutation = api.models.upsert.useMutation({
    onSuccess: (upsertedModel) => {
      utils.models.invalidate();
      form.reset();
      setOpen(false);
      showSuccessToast({
        title:
          props.action === "edit"
            ? t("model.success.modelUpdated")
            : t("model.success.modelCreated"),
        description:
          props.action === "edit"
            ? t("model.success.modelUpdatedDescription", {
                modelName: upsertedModel.modelName,
              })
            : t("model.success.modelCreatedDescription", {
                modelName: upsertedModel.modelName,
              }),
      });
      router.push(
        `/project/${props.projectId}/settings/models/${upsertedModel.id}`,
      );
    },
    onError: (error) => setFormError(error.message),
  });

  const onSubmit = async (values: FormUpsertModel) => {
    capture("models:new_form_submit");

    await upsertModelMutation
      .mutateAsync({
        modelId: props.action === "edit" ? props.modelData.id : null,
        projectId: props.projectId,
        modelName:
          props.action === "edit"
            ? props.modelData.modelName
            : values.modelName,
        matchPattern: values.matchPattern,
        prices: values.prices,
        tokenizerId: values.tokenizerId,
        tokenizerConfig:
          values.tokenizerConfig &&
          typeof JSON.parse(values.tokenizerConfig) === "object"
            ? (JSON.parse(values.tokenizerConfig) as Record<string, number>)
            : undefined,
      })
      .catch((error) => {
        setFormError(error.message);
      });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(open) => {
        if (!open) return; // Only allow closing via cancel key
        setOpen(open);
      }}
      dismissible={false}
      onClose={() => {
        form.reset();
        setFormError(null);
      }}
    >
      <DrawerTrigger
        asChild
        onClick={() => setOpen(true)}
        className={props.className}
        title={
          props.action === "create"
            ? t("model.form.createModelDefinition")
            : t("model.form.editModelDefinition")
        }
      >
        {children}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center justify-between">
            <DrawerTitle>
              {props.action === "create"
                ? t("model.form.createModel")
                : props.action === "clone"
                  ? t("model.form.cloneModel")
                  : t("model.form.editModel")}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X size={20} />
            </Button>
          </div>
          <DrawerDescription>
            {props.action === "edit"
              ? props.modelData.modelName
              : props.action === "create"
                ? t("model.form.createNewModelDescription")
                : null}
          </DrawerDescription>
        </DrawerHeader>
        <Form {...form}>
          <form
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex h-full max-h-[100vh] flex-col gap-6 overflow-y-auto p-4 pt-0"
          >
            <FormField
              control={form.control}
              name="modelName"
              disabled={props.action === "edit"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("model.form.modelName")}</FormLabel>
                  <FormDescription>
                    {t("model.form.modelNameDescription")}
                  </FormDescription>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="matchPattern"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("model.form.matchPattern")}</FormLabel>
                  <FormDescription>
                    {t("model.form.matchPatternDescription")}
                  </FormDescription>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prices"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    {t("model.form.prices")}
                  </FormLabel>
                  <FormDescription>
                    {t("model.form.pricesDescription")}
                  </FormDescription>
                  <span className="flex flex-col gap-2">
                    <FormDescription>
                      {t("model.form.prefillUsageTypes")}
                    </FormDescription>
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          field.onChange({
                            input: 0,
                            output: 0,
                            input_cached_tokens: 0,
                            output_reasoning_tokens: 0,
                            ...field.value,
                          });
                        }}
                      >
                        {t("model.form.openai")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          field.onChange({
                            input: 0,
                            input_tokens: 0,
                            output: 0,
                            output_tokens: 0,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 0,
                            ...field.value,
                          });
                        }}
                      >
                        {t("model.form.anthropic")}
                      </Button>
                    </span>
                  </span>
                  <FormControl>
                    <span className="flex flex-col gap-2">
                      <FormDescription className="grid grid-cols-2 gap-1">
                        <span>{t("model.form.usageType")}</span>
                        <span>{t("model.form.price")}</span>
                      </FormDescription>
                      {Object.entries(field.value).map(
                        ([key, value], index) => (
                          <div key={index} className="grid grid-cols-2 gap-1">
                            <Input
                              placeholder={t("model.form.keyPlaceholder")}
                              value={key}
                              onChange={(e) => {
                                const newPrices = { ...field.value };
                                const oldValue = newPrices[key];
                                delete newPrices[key];
                                newPrices[e.target.value] = oldValue;
                                field.onChange(newPrices);
                              }}
                            />
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                placeholder={t("model.form.pricePlaceholder")}
                                value={value}
                                step="0.000001"
                                onChange={(e) => {
                                  field.onChange({
                                    ...field.value,
                                    [key]: parseFloat(e.target.value),
                                  });
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                title={t("model.form.removePrice")}
                                size="icon"
                                onClick={() => {
                                  const newPrices = { ...field.value };
                                  delete newPrices[key];
                                  field.onChange(newPrices);
                                }}
                              >
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ),
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          field.onChange({
                            ...field.value,
                            new_usage_type: 0.000001,
                          });
                        }}
                        className="flex items-center gap-1"
                      >
                        <PlusCircle className="h-4 w-4" />
                        <span>{t("model.form.addPrice")}</span>
                      </Button>
                      <PricePreview prices={field.value} />
                    </span>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tokenizerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("model.form.tokenizer")}</FormLabel>
                  <Select
                    onValueChange={(tokenizerId) => {
                      field.onChange(tokenizerId);
                      if (tokenizerId === "None") {
                        form.setValue("tokenizerConfig", "{}");
                      }
                    }}
                    defaultValue={field.value ?? "None"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t("model.form.selectUnit")} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {["openai", "claude", "None"].map((unit) => (
                        <SelectItem value={unit} key={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t("model.form.tokenizerDescription")}{" "}
                    <Link
                      href="https://langfuse.com/docs/model-usage-and-cost"
                      className="underline"
                      target="_blank"
                    >
                      {t("model.form.docs")}
                    </Link>
                    .
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {tokenizerId && tokenizerId !== "None" && (
              <FormField
                control={form.control}
                name="tokenizerConfig"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("model.form.tokenizerConfig")}</FormLabel>
                    <CodeMirrorEditor
                      mode="json"
                      value={field.value ?? "{}"}
                      onChange={field.onChange}
                      minHeight="none"
                    />
                    <FormDescription>
                      {t("model.form.tokenizerConfigDescription")}{" "}
                      <Link
                        href="https://langfuse.com/docs/model-usage-and-cost"
                        className="underline"
                        target="_blank"
                      >
                        {t("model.form.docs")}
                      </Link>{" "}
                      {t("model.form.forDetails")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DrawerFooter className="flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="w-full"
              >
                {t("common.actions.cancel")}
              </Button>

              <Button
                type="submit"
                className="w-full"
                loading={upsertModelMutation.isPending}
              >
                {t("common.actions.submit")}
              </Button>
            </DrawerFooter>
          </form>
          {formError ? (
            <p className="my-2 text-center text-sm font-medium text-destructive">
              <span className="font-semibold">{t("common.errors.error")}</span>{" "}
              {formError}
            </p>
          ) : null}
        </Form>
      </DrawerContent>
    </Drawer>
  );
};
