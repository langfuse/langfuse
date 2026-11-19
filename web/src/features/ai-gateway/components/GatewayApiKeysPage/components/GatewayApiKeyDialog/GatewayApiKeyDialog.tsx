import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { AddSectionButton } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/AddSectionButton/AddSectionButton";
import { GatewaySpendBudgetField } from "@/src/features/ai-gateway/components/GatewaySpendBudgetField/GatewaySpendBudgetField";
import { OptionalSection } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/OptionalSection/OptionalSection";
import { GatewayApiKeyExpirationField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/GatewayApiKeyExpirationField/GatewayApiKeyExpirationField";
import { GatewayApiKeyMetadataField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyMetadataField/GatewayApiKeyMetadataField";
import { GatewayApiKeyModelsField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/GatewayApiKeyModelsField";
import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import { resolveGatewayApiKeyExpiration } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/fns/resolveGatewayApiKeyExpiration";
import {
  gatewayApiKeyFormFieldsSchema,
  gatewayApiKeyFormSchema,
  gatewayApiKeySections,
  type GatewayApiKeyFormValues,
  type GatewayApiKeySection,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";
import { toGatewaySpendLimit } from "@/src/features/ai-gateway/fns/gatewaySpendBudgetFormValue";
import { emptyGatewaySpendBudget } from "@/src/features/ai-gateway/types/gatewaySpendBudgetFormSchema";
import { toGatewayApiKeyMetadata } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewayApiKeyMetadata";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";
import type { RouterInputs } from "@/src/utils/api";

const emptyValues: GatewayApiKeyFormValues = {
  issuedAs: "user",
  name: "",
  expiryPreset: "never",
  customExpiry: "",
  metadata: [],
  modelPatterns: [],
  spendBudget: emptyGatewaySpendBudget,
  sections: [],
};

// Metadata has no section remove button: removing its last row removes it.
const sectionLabels: Record<
  GatewayApiKeySection,
  { add: string; remove?: string }
> = {
  expiration: { add: "Expiration", remove: "Remove expiration" },
  spendBudget: { add: "Spend budget", remove: "Remove spend budget" },
  models: { add: "Restrict models", remove: "Remove model restriction" },
  metadata: { add: "Additional metadata" },
};

const issuedAsDescriptions: Record<
  GatewayApiKeyFormValues["issuedAs"],
  string
> = {
  user: "Stops working if you leave the organization.",
  serviceAccount: "Keeps working when people leave the organization.",
};

// A locked key may belong to another member, so it is not described as "you".
const lockedIssuedAsDescriptions: Record<
  GatewayApiKeyFormValues["issuedAs"],
  string
> = {
  user: "Stops working if its owner leaves the organization.",
  serviceAccount: issuedAsDescriptions.serviceAccount,
};

type GatewayApiKeySubmission = Omit<
  RouterInputs["aiGateway"]["createApiKey"],
  "orgId"
> & {
  expiryPreset: GatewayApiKeyExpirationPreset;
  metadataCount: number;
};

/** Fields shown but locked, e.g. the ones a key cannot change after creation. */
type GatewayApiKeyDisabledField = "issuedAs" | "expiration" | "spendBudget";

const LOCKED_SPEND_BUDGET_REASON =
  "This key has more than one budget, so it can't be changed here. Its budgets stay as they are.";

type GatewayApiKeyDialogProps = {
  title: string;
  submitLabel: string;
  /** Prefills the form, e.g. with an existing key; saving needs a change. */
  defaultValues?: GatewayApiKeyFormValues;
  disabledFields?: GatewayApiKeyDisabledField[];
  canIssueServiceAccountKeys: boolean;
  /** Previews which models the patterns allow; undefined hides the preview. */
  enabledModels: GatewayEnabledModels | undefined;
  /** Why a spend budget cannot be set or changed; undefined when it can. */
  spendBudgetUnavailableReason?: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (submission: GatewayApiKeySubmission) => void;
};

export function GatewayApiKeyDialog({
  title,
  submitLabel,
  defaultValues = emptyValues,
  disabledFields = [],
  canIssueServiceAccountKeys,
  enabledModels,
  spendBudgetUnavailableReason,
  errorMessage,
  isSubmitting,
  onSubmit,
}: GatewayApiKeyDialogProps) {
  const formId = useId();
  const isExpirationDisabled = disabledFields.includes("expiration");
  const form = useForm<GatewayApiKeyFormValues>({
    // A locked expiration may already lie in the past.
    resolver: zodResolver(
      isExpirationDisabled
        ? gatewayApiKeyFormFieldsSchema
        : gatewayApiKeyFormSchema,
    ),
    defaultValues,
    mode: "onChange",
  });
  const expiryPreset = useWatch({
    control: form.control,
    name: "expiryPreset",
  });
  const customExpiryError =
    expiryPreset === "custom"
      ? form.formState.errors.customExpiry?.message
      : undefined;

  const handleValidSubmit = (values: GatewayApiKeyFormValues) => {
    const expiresAt = resolveGatewayApiKeyExpiration(
      values.expiryPreset,
      values.customExpiry,
    );
    if (expiresAt === undefined && !isExpirationDisabled) return;
    const metadata = toGatewayApiKeyMetadata(values.metadata);
    onSubmit({
      name: values.name.trim(),
      metadata,
      metadataCount: Object.keys(metadata).length,
      allowedModels:
        values.modelPatterns.length > 0 ? values.modelPatterns : null,
      expiresAt: expiresAt ?? null,
      expiryPreset: values.expiryPreset,
      issuedAs: canIssueServiceAccountKeys ? values.issuedAs : "user",
      spendLimit: values.sections.includes("spendBudget")
        ? toGatewaySpendLimit(values.spendBudget)
        : null,
    });
  };

  return (
    <Dialog
      title={title}
      size="md"
      actions={[
        {
          label: submitLabel,
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: !form.formState.isValid || !form.formState.isDirty,
          disabledReason: customExpiryError,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          density="compact"
          actions={[]}
          onSubmit={form.handleSubmit(handleValidSubmit)}
        >
          {canIssueServiceAccountKeys ? (
            <IssuedAsField
              control={form.control}
              disabled={disabledFields.includes("issuedAs")}
            />
          ) : null}
          <CustomTooltip
            content={
              <span>
                Shown in the key list. Use it to describe what consumes the key.
              </span>
            }
          >
            {({ getTriggerProps }) => (
              <Form.InputField
                control={form.control}
                name="name"
                label="Name"
                required
                registerLabelTooltip={getTriggerProps}
                maxLength={500}
                placeholder="e.g. claude-local, codex-local, or backend-service"
              />
            )}
          </CustomTooltip>
          <OptionalSections
            form={form}
            enabledModels={enabledModels}
            isExpirationDisabled={isExpirationDisabled}
            isSpendBudgetDisabled={disabledFields.includes("spendBudget")}
            spendBudgetUnavailableReason={spendBudgetUnavailableReason}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Gateway key could not be saved</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}

function IssuedAsField({
  control,
  disabled,
}: {
  control: Control<GatewayApiKeyFormValues>;
  disabled: boolean;
}) {
  const issuedAs = useWatch({ control, name: "issuedAs" });
  const descriptions = disabled
    ? lockedIssuedAsDescriptions
    : issuedAsDescriptions;
  return (
    <Form.Field
      control={control}
      name="issuedAs"
      label="Issued as"
      description={descriptions[issuedAs]}
    >
      {(field) => (
        <div id={field.id}>
          <Tabs
            activationMode="manual"
            value={field.value}
            onValueChange={field.onChange}
          >
            <Tabs.List variant="inset" size="md" aria-label="Issued as">
              <Tabs.Trigger
                value="user"
                label={disabled ? "User" : "My user"}
                disabled={disabled}
              />
              <Tabs.Trigger
                value="serviceAccount"
                label="Service account"
                disabled={disabled}
              />
            </Tabs.List>
          </Tabs>
        </div>
      )}
    </Form.Field>
  );
}

/**
 * Optional settings, each in its own box. A loaded key shows its sections in
 * the default order; a section added here goes to the bottom, below the others.
 */
function OptionalSections({
  form,
  enabledModels,
  isExpirationDisabled,
  isSpendBudgetDisabled,
  spendBudgetUnavailableReason,
}: {
  form: UseFormReturn<GatewayApiKeyFormValues>;
  enabledModels: GatewayEnabledModels | undefined;
  isExpirationDisabled: boolean;
  isSpendBudgetDisabled: boolean;
  spendBudgetUnavailableReason: string | undefined;
}) {
  const isLocked = (section: GatewayApiKeySection) =>
    (section === "expiration" && isExpirationDisabled) ||
    (section === "spendBudget" && isSpendBudgetDisabled);
  const sections = useWatch({ control: form.control, name: "sections" });
  const update = { shouldDirty: true, shouldValidate: true } as const;
  const addableSections = gatewayApiKeySections.filter(
    (section) => !sections.includes(section) && !isLocked(section),
  );

  const handleAdd = (section: GatewayApiKeySection) => {
    if (section === "expiration") {
      form.setValue("expiryPreset", "1d", update);
    }
    if (section === "metadata") {
      form.setValue("metadata", [{ key: "", value: "" }], update);
    }
    form.setValue("sections", [...sections, section], update);
  };

  // A removed section no longer applies, so its value is cleared.
  const handleRemove = (section: GatewayApiKeySection) => {
    switch (section) {
      case "expiration":
        form.setValue("expiryPreset", "never", update);
        form.setValue("customExpiry", "", update);
        break;
      case "spendBudget":
        form.setValue("spendBudget", emptyGatewaySpendBudget, update);
        break;
      case "models":
        form.setValue("modelPatterns", [], update);
        break;
      case "metadata":
        form.setValue("metadata", [], update);
        break;
    }
    form.setValue(
      "sections",
      sections.filter((shown) => shown !== section),
      update,
    );
  };

  const renderSection = (section: GatewayApiKeySection) => {
    switch (section) {
      case "expiration":
        return (
          <GatewayApiKeyExpirationField
            control={form.control}
            disabled={isExpirationDisabled}
          />
        );
      case "spendBudget":
        return (
          <GatewaySpendBudgetField
            subject="key"
            control={form.control}
            disabledReason={
              isSpendBudgetDisabled
                ? LOCKED_SPEND_BUDGET_REASON
                : spendBudgetUnavailableReason
            }
          />
        );
      case "models":
        return (
          <GatewayApiKeyModelsField
            control={form.control}
            enabledModels={enabledModels}
          />
        );
      case "metadata":
        return (
          <GatewayApiKeyMetadataField
            control={form.control}
            onRemoveLast={() => handleRemove("metadata")}
          />
        );
    }
  };

  return (
    <>
      {sections.map((section) => {
        const removeLabel = sectionLabels[section].remove;
        return (
          <OptionalSection
            key={section}
            remove={
              removeLabel && !isLocked(section)
                ? { label: removeLabel, onRemove: () => handleRemove(section) }
                : undefined
            }
          >
            {renderSection(section)}
          </OptionalSection>
        );
      })}
      {addableSections.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {addableSections.map((section) => (
            <AddSectionButton
              key={section}
              label={sectionLabels[section].add}
              disabledReason={
                section === "spendBudget"
                  ? spendBudgetUnavailableReason
                  : undefined
              }
              onAdd={() => handleAdd(section)}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
