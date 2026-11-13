import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type Control } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Form } from "@/src/components/design-system/Form/Form";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { GatewayApiKeyExpirationField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/components/GatewayApiKeyExpirationField/GatewayApiKeyExpirationField";
import { GatewayApiKeyMetadataField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyMetadataField/GatewayApiKeyMetadataField";
import { GatewayApiKeyModelsField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/GatewayApiKeyModelsField";
import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import { resolveGatewayApiKeyExpiration } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/fns/resolveGatewayApiKeyExpiration";
import {
  gatewayApiKeyFormFieldsSchema,
  gatewayApiKeyFormSchema,
  type GatewayApiKeyFormValues,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";
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
type GatewayApiKeyDisabledField = "issuedAs" | "expiration";

type GatewayApiKeyDialogProps = {
  title: string;
  submitLabel: string;
  /** Prefills the form, e.g. with an existing key; saving needs a change. */
  defaultValues?: GatewayApiKeyFormValues;
  disabledFields?: GatewayApiKeyDisabledField[];
  canIssueServiceAccountKeys: boolean;
  /** Previews which models the patterns allow; undefined hides the preview. */
  enabledModels: GatewayEnabledModels | undefined;
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
          // The date input is hidden while "More options" is collapsed.
          disabledReason: customExpiryError,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
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
          <MoreOptions
            control={form.control}
            enabledModels={enabledModels}
            isExpirationDisabled={isExpirationDisabled}
            defaultExpanded={hasOptionsSet(defaultValues)}
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

function MoreOptions({
  control,
  enabledModels,
  isExpirationDisabled,
  defaultExpanded,
}: {
  control: Control<GatewayApiKeyFormValues>;
  enabledModels: GatewayEnabledModels | undefined;
  isExpirationDisabled: boolean;
  defaultExpanded: boolean;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <ExpandToggle
          expanded={isExpanded}
          onExpandedChange={setIsExpanded}
          label="More options"
          expandedLabel="Fewer options"
          variant="icon"
          iconPosition="left"
          size="sm"
          controls={contentId}
        />
      </div>
      {isExpanded ? (
        <div id={contentId} className="flex flex-col gap-5 pl-5">
          <GatewayApiKeyExpirationField
            control={control}
            disabled={isExpirationDisabled}
          />
          <GatewayApiKeyMetadataField control={control} />
          <GatewayApiKeyModelsField
            control={control}
            enabledModels={enabledModels}
          />
        </div>
      ) : null}
    </div>
  );
}

function hasOptionsSet(values: GatewayApiKeyFormValues) {
  return (
    values.expiryPreset !== "never" ||
    values.metadata.length > 0 ||
    values.modelPatterns.length > 0
  );
}
