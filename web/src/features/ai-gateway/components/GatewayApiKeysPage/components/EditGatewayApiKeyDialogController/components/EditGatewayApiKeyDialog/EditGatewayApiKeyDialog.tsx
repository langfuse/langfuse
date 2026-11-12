import { useId } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Form } from "@/src/components/design-system/Form/Form";
import { GatewayApiKeyMetadataField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyMetadataField/GatewayApiKeyMetadataField";
import { GatewayApiKeyModelsField } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/GatewayApiKeyModelsField";
import { toGatewayApiKeyMetadata } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewayApiKeyMetadata";
import {
  editableGatewayApiKeyFieldsSchema,
  type EditableGatewayApiKeyFields,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/types/editableGatewayApiKeyFieldsSchema";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";
import type { RouterInputs } from "@/src/utils/api";

type EditGatewayApiKeyDialogProps = {
  defaultValues: EditableGatewayApiKeyFields;
  /** Previews which models the patterns allow; undefined hides the preview. */
  enabledModels: GatewayEnabledModels | undefined;
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (
    submission: Pick<
      RouterInputs["aiGateway"]["updateApiKey"],
      "metadata" | "allowedModels"
    >,
  ) => void;
};

export function EditGatewayApiKeyDialog({
  defaultValues,
  enabledModels,
  errorMessage,
  isSubmitting,
  onSubmit,
}: EditGatewayApiKeyDialogProps) {
  const formId = useId();
  const form = useForm<EditableGatewayApiKeyFields>({
    resolver: zodResolver(editableGatewayApiKeyFieldsSchema),
    defaultValues,
  });

  const handleValidSubmit = (values: EditableGatewayApiKeyFields) =>
    onSubmit({
      metadata: toGatewayApiKeyMetadata(values.metadata),
      allowedModels:
        values.modelPatterns.length > 0 ? values.modelPatterns : null,
    });

  return (
    <Dialog
      title="Edit gateway key"
      size="md"
      actions={[
        {
          label: "Save changes",
          type: "submit",
          form: formId,
          loading: isSubmitting,
          disabled: !form.formState.isDirty,
        },
      ]}
    >
      <Dialog.Body>
        <Form
          id={formId}
          actions={[]}
          onSubmit={form.handleSubmit(handleValidSubmit)}
        >
          <GatewayApiKeyMetadataField control={form.control} />
          <GatewayApiKeyModelsField
            control={form.control}
            enabledModels={enabledModels}
          />
          {errorMessage !== null ? (
            <Alert variant="destructive">
              <Alert.Title>Gateway key could not be updated</Alert.Title>
              <Alert.Description>{errorMessage}</Alert.Description>
            </Alert>
          ) : null}
        </Form>
      </Dialog.Body>
    </Dialog>
  );
}
