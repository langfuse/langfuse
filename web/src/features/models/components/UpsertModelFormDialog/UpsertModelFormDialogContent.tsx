import type { Ref } from "react";
import type { ModelFormSource } from "@/src/features/models/fns/buildFormValues";
import type { FormUpsertModel } from "@/src/features/models/validation";
import { ModelFormDialogContent } from "./ModelFormDialogContent";
import { useRouter } from "next/router";
import { toPricingTierInputs } from "@/src/features/models/fns/toPricingTierInputs";
import { useUpsertModelDefinition } from "@/src/features/models/hooks/useModelDefinitionApi";
import {
  modelDetailHref,
  type ModelOwner,
} from "@/src/features/models/modelOwner";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export type UpsertModelFormProps = ModelFormSource & {
  owner: ModelOwner;
  /** Called after the model is created, in place of opening its page. */
  onCreated?: () => void;
};

const titleByAction = {
  create: "Create Model",
  clone: "Clone Model",
  edit: "Edit Model",
} as const satisfies Record<ModelFormSource["action"], string>;

const describeSource = (source: ModelFormSource) => {
  if (source.action === "edit") return source.modelData.modelName;
  if (source.action === "create")
    return "Create a new model configuration to track generation costs.";
  return undefined;
};

export function UpsertModelFormDialogContent({
  owner,
  onCreated,
  closeDialog,
  closeGuardRef,
  ...source
}: UpsertModelFormProps & {
  closeDialog: () => void;
  closeGuardRef?: Ref<() => boolean>;
}) {
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const { upsert, isPending } = useUpsertModelDefinition(owner);
  const isEdit = source.action === "edit";

  const onSubmit = async (values: FormUpsertModel) => {
    capture("models:new_form_submit");
    const upsertedModel = await upsert({
      modelId: source.action === "edit" ? source.modelData.id : null,
      modelName:
        source.action === "edit"
          ? source.modelData.modelName
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

    showSuccessToast({
      operation: isEdit ? "model.update" : "model.create",
      title: `Model ${isEdit ? "updated" : "created"}`,
      description: `The model '${upsertedModel.modelName}' has been successfully ${isEdit ? "updated" : "created"}. New generations will use these model prices.`,
    });
    return upsertedModel;
  };

  return (
    <ModelFormDialogContent
      source={source}
      title={titleByAction[source.action]}
      description={describeSource(source)}
      isSubmitting={isPending}
      onSubmit={onSubmit}
      onCreated={(modelId) => {
        closeDialog();
        if (onCreated) {
          onCreated();
          return;
        }
        router.push(modelDetailHref(owner, modelId));
      }}
      onCancel={closeDialog}
      closeGuardRef={closeGuardRef}
    />
  );
}
