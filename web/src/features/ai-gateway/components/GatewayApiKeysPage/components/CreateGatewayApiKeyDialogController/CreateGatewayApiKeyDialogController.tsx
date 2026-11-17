import { useState, type ComponentProps, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConnectedGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/ConnectedGatewayApiKeyDialog/ConnectedGatewayApiKeyDialog";
import { GeneratedKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/GeneratedKeyDialog/GeneratedKeyDialog";
import { GeneratedKeyContent } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/GeneratedKeyContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

export function CreateGatewayApiKeyDialogController({
  organizationId,
  children,
}: {
  organizationId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const canIssueServiceAccountKeys = useHasOrganizationAccess({
    organizationId,
    scope: "gateway:manage",
  });
  const [generatedSecretKey, setGeneratedSecretKey] = useState<string | null>(
    null,
  );
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const session = useSession();
  const create = api.aiGateway.createApiKey.useMutation({
    onError: (error) =>
      reportTrpcErrorWithoutToast(error, "ai-gateway-api-keys"),
  });

  const reset = () => setGeneratedSecretKey(null);

  const submit: ComponentProps<
    typeof ConnectedGatewayApiKeyDialog
  >["onSubmit"] = async ({ expiryPreset, metadataCount, ...input }) => {
    try {
      const created = await create.mutateAsync({
        orgId: organizationId,
        ...input,
      });
      capture("ai_gateway:api_key_created", {
        orgId: organizationId,
        creatorRole:
          session.data?.user?.organizations.find(
            (organization) => organization.id === organizationId,
          )?.role ?? null,
        isServiceAccount: input.issuedAs === "serviceAccount",
        hasMetadata: metadataCount > 0,
        metadataCount,
        hasDescription: input.name.length > 0,
        expiryPreset,
      });
      setGeneratedSecretKey(created.secretKey);
      await Promise.all([
        utils.aiGateway.listApiKeys.invalidate({ orgId: organizationId }),
        utils.aiGateway.getAnalyticsLabels.invalidate({
          orgId: organizationId,
        }),
      ]);
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-api-keys");
    }
  };

  return (
    <DialogController
      onBeforeClose={() => !create.isPending}
      renderDialog={({ isOpen }) =>
        generatedSecretKey ? (
          <GeneratedKeyDialog>
            <GeneratedKeyContent
              organizationId={organizationId}
              secretKey={generatedSecretKey}
            />
          </GeneratedKeyDialog>
        ) : (
          <ConnectedGatewayApiKeyDialog
            organizationId={organizationId}
            isOpen={isOpen}
            title="Create gateway key"
            submitLabel="Create key"
            canIssueServiceAccountKeys={canIssueServiceAccountKeys}
            errorMessage={
              create.isError
                ? (create.error?.message ?? "Check the metadata and try again.")
                : null
            }
            isSubmitting={create.isPending}
            onSubmit={submit}
          />
        )
      }
    >
      {({ openDialog }) =>
        children({
          openDialog: () => {
            reset();
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
