import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type Control } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Form } from "@/src/components/design-system/Form/Form";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { GatewayApiKeyExpirationField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyExpirationField/GatewayApiKeyExpirationField";
import { GatewayApiKeyMetadataField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyMetadataField/GatewayApiKeyMetadataField";
import { GatewayApiKeyModelsField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/GatewayApiKeyModelsField";
import type { GatewayApiKeyExpirationPreset } from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";
import { resolveGatewayApiKeyExpiration } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/fns/resolveGatewayApiKeyExpiration";
import {
  createGatewayApiKeyFormSchema,
  type CreateGatewayApiKeyFormValues,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/types/createGatewayApiKeyFormSchema";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";
import type { RouterInputs } from "@/src/utils/api";

const defaultValues: CreateGatewayApiKeyFormValues = {
  issuedAs: "user",
  name: "",
  expiryPreset: "never",
  customExpiry: "",
  metadata: [],
  modelPatterns: [],
};

const issuedAsDescriptions: Record<
  CreateGatewayApiKeyFormValues["issuedAs"],
  string
> = {
  user: "Stops working if you leave the organization.",
  serviceAccount: "Keeps working when people leave the organization.",
};

type CreateGatewayApiKeySubmission = Omit<
  RouterInputs["aiGateway"]["createApiKey"],
  "orgId"
> & {
  expiryPreset: GatewayApiKeyExpirationPreset;
  metadataCount: number;
};

type CreateGatewayApiKeyDialogProps = {
  canIssueServiceAccountKeys: boolean;
  /** Previews which models the patterns allow; undefined hides the preview. */
  enabledModels: GatewayEnabledModels | undefined;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (submission: CreateGatewayApiKeySubmission) => void;
};

export function CreateGatewayApiKeyDialog({
  canIssueServiceAccountKeys,
  enabledModels,
  errorMessage,
  isSubmitting,
  onSubmit,
}: CreateGatewayApiKeyDialogProps) {
  const formId = useId();
  const form = useForm<CreateGatewayApiKeyFormValues>({
    resolver: zodResolver(createGatewayApiKeyFormSchema),
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

  const handleValidSubmit = (values: CreateGatewayApiKeyFormValues) => {
    const expiresAt = resolveGatewayApiKeyExpiration(
      values.expiryPreset,
      values.customExpiry,
    );
    if (expiresAt === undefined) return;
    const metadata = Object.fromEntries(
      values.metadata
        .filter((field) => field.key.trim())
        .map((field) => [field.key.trim(), field.value]),
    );
    onSubmit({
      name: values.name.trim(),
      metadata,
      metadataCount: Object.keys(metadata).length,
      allowedModels:
        values.modelPatterns.length > 0 ? values.modelPatterns : null,
      expiresAt,
      expiryPreset: values.expiryPreset,
      issuedAs: canIssueServiceAccountKeys ? values.issuedAs : "user",
    });
  };

  return (
    <Dialog
      title="Create gateway key"
      size="md"
      actions={[
        {
          label: "Create key",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: !form.formState.isValid,
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
            <IssuedAsField control={form.control} />
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
          <MoreOptions control={form.control} enabledModels={enabledModels} />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Gateway key could not be created</Alert.Title>
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
}: {
  control: Control<CreateGatewayApiKeyFormValues>;
}) {
  const issuedAs = useWatch({ control, name: "issuedAs" });
  return (
    <Form.Field
      control={control}
      name="issuedAs"
      label="Issued as"
      description={issuedAsDescriptions[issuedAs]}
    >
      {(field) => (
        <div id={field.id}>
          <Tabs
            activationMode="manual"
            value={field.value}
            onValueChange={field.onChange}
          >
            <Tabs.List variant="inset" size="md" aria-label="Issued as">
              <Tabs.Trigger value="user" label="My user" />
              <Tabs.Trigger value="serviceAccount" label="Service account" />
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
}: {
  control: Control<CreateGatewayApiKeyFormValues>;
  enabledModels: GatewayEnabledModels | undefined;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(false);

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
          <GatewayApiKeyExpirationField control={control} />
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
