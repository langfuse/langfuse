/* eslint-disable @repo/no-abstracted-overlay-trigger */
/* eslint @repo/no-style-props: "off" */
import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash/isEqual";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { CodeMirrorEditor } from "@/src/components/editor";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { buildFormValues } from "@/src/features/models/fns/buildFormValues";
import { matchPatternFor } from "@/src/features/models/fns/matchPatternFor";
import { toPricingTierInputs } from "@/src/features/models/fns/toPricingTierInputs";
import {
  type FormUpsertModel,
  FormUpsertModelSchema,
  type GetModelResult,
} from "@/src/features/models/validation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";

import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { PricingSection } from "@/src/features/models/components/PricingSection/PricingSection";
import { useTranslations } from "next-intl";

type UpsertModelDialogProps =
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

export const UpsertModelFormDialog = (({
  children,
  ...props
}: UpsertModelDialogProps) => {
  const t = useTranslations("settingsEnterprise.models");
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormUpsertModelSchema),
    defaultValues: buildFormValues(props),
  });

  const tokenizerId = form.watch("tokenizerId");

  const upsertModelMutation = api.models.upsert.useMutation();

  const onSubmit = async (values: FormUpsertModel) => {
    capture("models:new_form_submit");
    setFormError(null);
    // Snapshot before the await: nothing typed while the save is in flight may
    // become part of the saved baseline, or the dirty guard would let it go.
    // getValues() copies only the top level, so the clone is load-bearing.
    const submitted = cloneDeep(form.getValues());

    try {
      const upsertedModel = await upsertModelMutation.mutateAsync({
        modelId: props.action === "edit" ? props.modelData.id : null,
        projectId: props.projectId,
        modelName:
          props.action === "edit"
            ? props.modelData.modelName
            : values.modelName,
        matchPattern: values.matchPattern,
        pricingTiers: toPricingTierInputs(values),
        tokenizerId: values.tokenizerId,
        tokenizerConfig:
          values.tokenizerConfig &&
          typeof JSON.parse(values.tokenizerConfig) === "object"
            ? (JSON.parse(values.tokenizerConfig) as Record<string, number>)
            : undefined,
      });

      utils.models.invalidate();
      showSuccessToast({
        title:
          props.action === "edit"
            ? t("upsert.updatedTitle")
            : t("upsert.createdTitle"),
        description:
          props.action === "edit"
            ? t("upsert.updatedDescription", {
                modelName: upsertedModel.modelName,
              })
            : t("upsert.createdDescription", {
                modelName: upsertedModel.modelName,
              }),
      });

      // Editing is a checkpoint, not an exit: keep the dialog and its context.
      if (props.action === "edit") {
        const live = form.getValues();
        form.reset(submitted); // what we saved is the new clean baseline
        if (!isEqual(live, submitted)) {
          // Typed while the save was in flight: still the user's unsaved work.
          form.reset(live, { keepDefaultValues: true });
        }
        return;
      }

      setOpen(false);
      router.push(
        `/project/${props.projectId}/settings/models/${upsertedModel.id}`,
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  };

  const requestClose = () => {
    if (form.formState.isDirty && !window.confirm(t("upsert.discard"))) {
      return;
    }
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          requestClose();
          return;
        }
        // Reopening starts from the model's current data, not the last edit.
        form.reset(buildFormValues(props));
        setFormError(null);
        setOpen(true);
      }}
    >
      <DialogTrigger
        asChild
        onClick={() => setOpen(true)}
        className={props.className}
        title={
          props.action === "create"
            ? t("upsert.createTrigger")
            : props.action === "clone"
              ? t("actions.cloneTitle")
              : t("upsert.editTrigger")
        }
      >
        {children}
      </DialogTrigger>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {props.action === "create"
              ? t("upsert.createTitle")
              : props.action === "clone"
                ? t("upsert.cloneTitle")
                : t("upsert.editTitle")}
          </DialogTitle>
          {props.action === "edit" && (
            <DialogDescription>{props.modelData.modelName}</DialogDescription>
          )}
          {props.action === "create" && (
            <DialogDescription>
              {t("upsert.createDescription")}
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <DialogBody className="space-y-6">
              <FormField
                control={form.control}
                name="modelName"
                disabled={props.action === "edit"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.modelName")}</FormLabel>
                    <FormDescription>
                      {t("upsert.nameDescription")}
                    </FormDescription>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(e) => {
                          const previousName = form.getValues("modelName");
                          const nextName = e.target.value;
                          field.onChange(e);

                          // Follow the name only while the pattern is still the
                          // one we generated — a hand-written or cloned pattern
                          // is the user's, and typing a name must not touch it.
                          const pattern = form.getValues("matchPattern");
                          if (
                            !pattern ||
                            pattern === matchPatternFor(previousName)
                          ) {
                            form.setValue(
                              "matchPattern",
                              nextName ? matchPatternFor(nextName) : "",
                            );
                          }
                        }}
                      />
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
                    <FormLabel>{t("common.matchPattern")}</FormLabel>
                    <FormDescription>
                      {t("upsert.patternDescription")}
                    </FormDescription>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <PricingSection form={form} />

              <FormField
                control={form.control}
                name="tokenizerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("common.tokenizer")}</FormLabel>
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
                          <SelectValue
                            placeholder={t("upsert.selectTokenizer")}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {["openai", "claude", "None"].map((unit) => (
                          <SelectItem value={unit} key={unit}>
                            {unit === "None" ? t("common.none") : unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t.rich("upsert.tokenizerDescription", {
                        docs: (chunks) => (
                          <Link
                            href="https://langfuse.com/docs/model-usage-and-cost"
                            className="underline"
                            target="_blank"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
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
                      <FormLabel>{t("upsert.tokenizerConfigLabel")}</FormLabel>
                      <CodeMirrorEditor
                        mode="json"
                        value={field.value ?? "{}"}
                        onChange={field.onChange}
                      />
                      <FormDescription>
                        {t.rich("upsert.tokenizerConfigDescription", {
                          docs: (chunks) => (
                            <Link
                              href="https://langfuse.com/docs/model-usage-and-cost"
                              className="underline"
                              target="_blank"
                            >
                              {chunks}
                            </Link>
                          ),
                        })}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                {t("common.cancel")}
              </Button>

              <Button type="submit" loading={upsertModelMutation.isPending}>
                {props.action === "edit"
                  ? t("common.save")
                  : t("common.submit")}
              </Button>
            </DialogFooter>
          </form>
          {formError ? (
            <p className="text-destructive my-2 text-center text-sm font-bold">
              <span className="font-bold">{t("common.error")}</span> {formError}
            </p>
          ) : null}
        </Form>
      </DialogContent>
    </Dialog>
  );
}) as React.FC<UpsertModelDialogProps>;
