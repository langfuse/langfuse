import type { ComponentProps, ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConnectedGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/ConnectedGatewayApiKeyDialog/ConnectedGatewayApiKeyDialog";
import { getLoadedGatewayApiKeySections } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/fns/getLoadedGatewayApiKeySections";
import type { GatewayApiKeyFormValues } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";
import { toGatewaySpendBudgetFormValue } from "@/src/features/ai-gateway/fns/gatewaySpendBudgetFormValue";
import { restoreGatewayApiKeyMetadataTypes } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/restoreGatewayApiKeyMetadataTypes";
import { toGatewayApiKeyMetadataRows } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewayApiKeyMetadataRows";
import { toGatewaySpendLimitUpdate } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/fns/toGatewaySpendLimitUpdate";
import { parseGatewayAllowedModels } from "@/src/features/ai-gateway/fns/parseGatewayAllowedModels";
import { localDateInputValue } from "@/src/features/apiKey/fns/localDateInputValue";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";
import type { GatewaySpendLimit } from "@/src/features/ai-gateway/types/gatewaySpendLimit";

type EditableGatewayApiKey = {
  metadata: unknown;
  allowedModels: unknown;
  spendLimit: GatewaySpendLimit | null;
  hasSeveralSpendLimits: boolean;
  apiKey: {
    id: string;
    note: string | null;
    expiresAt: Date | null;
    /** Null for keys issued as a service account. */
    user: object | null;
  };
};

type SubmitHandler = ComponentProps<
  typeof ConnectedGatewayApiKeyDialog
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
  const canIssueServiceAccountKeys = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:manage",
  });
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const update = api.aiGateway.updateApiKey.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-api-keys"),
  });

  const createSubmitHandler =
    (apiKey: EditableGatewayApiKey, closeDialog: () => void): SubmitHandler =>
    async (input) => {
      try {
        await update.mutateAsync({
          orgId: organizationId,
          id: apiKey.apiKey.id,
          name: input.name,
          allowedModels: input.allowedModels,
          metadata: restoreGatewayApiKeyMetadataTypes(
            input.metadata ?? {},
            apiKey.metadata,
          ),
          previousAllowedModels: parseGatewayAllowedModels(
            apiKey.allowedModels,
          ),
          spendLimit: toGatewaySpendLimitUpdate({
            loaded: apiKey.spendLimit,
            hasSeveralSpendLimits: apiKey.hasSeveralSpendLimits,
            submitted: input.spendLimit,
          }),
        });
        capture("ai_gateway:api_key_updated", {
          orgId: organizationId,
          metadataCount: input.metadataCount,
          modelPatternCount: input.allowedModels?.length ?? 0,
        });
        await Promise.all([
          utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
          utils.aiGateway.getAnalyticsLabels.invalidate({
            orgId: organizationId,
          }),
          utils.aiGateway.getApiKeysSpend.invalidate({ orgId: organizationId }),
        ]);
        closeDialog();
      } catch (error) {
        reportNonTrpcError(error, "ai-gateway-api-keys");
        // A conflict means the cached row is stale; reopening must load the current key.
        await utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId });
      }
    };

  return (
    <DialogController<EditableGatewayApiKey>
      onBeforeClose={() => !update.isPending}
      onDismiss={update.reset}
      renderDialog={({ state, isOpen, closeDialog }) => (
        <ConnectedGatewayApiKeyDialog
          organizationId={organizationId}
          isOpen={isOpen}
          title="Edit gateway key"
          submitLabel="Save changes"
          canIssueServiceAccountKeys={canIssueServiceAccountKeys}
          disabledFields={
            state.hasSeveralSpendLimits
              ? ["issuedAs", "expiration", "spendBudget"]
              : ["issuedAs", "expiration"]
          }
          defaultValues={toEditableGatewayApiKeyFields(state)}
          errorMessage={
            update.isError
              ? (update.error?.message ?? "Check the metadata and try again.")
              : null
          }
          isSubmitting={update.isPending}
          onSubmit={createSubmitHandler(state, closeDialog)}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function toEditableGatewayApiKeyFields(
  apiKey: EditableGatewayApiKey,
): GatewayApiKeyFormValues {
  const { expiresAt } = apiKey.apiKey;
  const values = {
    issuedAs: apiKey.apiKey.user === null ? "serviceAccount" : "user",
    name: apiKey.apiKey.note ?? "",
    expiryPreset: expiresAt === null ? "never" : "custom",
    customExpiry: expiresAt === null ? "" : localDateInputValue(expiresAt),
    metadata: toGatewayApiKeyMetadataRows(apiKey.metadata),
    modelPatterns: parseGatewayAllowedModels(apiKey.allowedModels) ?? [],
    spendBudget: toGatewaySpendBudgetFormValue(apiKey.spendLimit),
  } satisfies Omit<GatewayApiKeyFormValues, "sections">;
  return { ...values, sections: getLoadedGatewayApiKeySections(values) };
}
