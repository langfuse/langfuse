import type { ComponentProps, ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConnectedEditGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/EditGatewayApiKeyDialogController/components/ConnectedEditGatewayApiKeyDialog/ConnectedEditGatewayApiKeyDialog";
import { toGatewayApiKeyMetadataRows } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewayApiKeyMetadataRows";
import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

type EditableGatewayApiKey = {
  metadata: unknown;
  allowedModels: unknown;
  apiKey: { id: string };
};

type SubmitHandler = ComponentProps<
  typeof ConnectedEditGatewayApiKeyDialog
>["onSubmit"];

type EditGatewayApiKeyDialogControllerProps = {
  organizationId: string;
  children: (control: {
    openDialog: (apiKey: EditableGatewayApiKey) => void;
  }) => ReactNode;
};

export function EditGatewayApiKeyDialogController({
  organizationId,
  children,
}: EditGatewayApiKeyDialogControllerProps) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const update = api.aiGateway.updateApiKey.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-api-keys"),
  });

  const createSubmitHandler =
    (apiKeyId: string, closeDialog: () => void): SubmitHandler =>
    async (input) => {
      try {
        await update.mutateAsync({
          orgId: organizationId,
          id: apiKeyId,
          ...input,
        });
        capture("ai_gateway:api_key_updated", {
          orgId: organizationId,
          metadataCount: Object.keys(input.metadata).length,
          modelPatternCount: input.allowedModels?.length ?? 0,
        });
        await Promise.all([
          utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
          utils.aiGateway.getAnalyticsLabels.invalidate({
            orgId: organizationId,
          }),
        ]);
        closeDialog();
      } catch (error) {
        reportNonTrpcError(error, "ai-gateway-api-keys");
      }
    };

  return (
    <DialogController<EditableGatewayApiKey>
      onBeforeClose={() => !update.isPending}
      onDismiss={update.reset}
      renderDialog={({ state, isOpen, closeDialog }) => (
        <ConnectedEditGatewayApiKeyDialog
          organizationId={organizationId}
          isOpen={isOpen}
          defaultValues={toEditableGatewayApiKeyFields(state)}
          errorMessage={
            update.isError
              ? (update.error?.message ?? "Check the metadata and try again.")
              : null
          }
          isSubmitting={update.isPending}
          onSubmit={createSubmitHandler(state.apiKey.id, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function toEditableGatewayApiKeyFields(apiKey: EditableGatewayApiKey) {
  return {
    metadata: toGatewayApiKeyMetadataRows(apiKey.metadata),
    modelPatterns: parseGatewayAllowedModels(apiKey.allowedModels) ?? [],
  };
}
