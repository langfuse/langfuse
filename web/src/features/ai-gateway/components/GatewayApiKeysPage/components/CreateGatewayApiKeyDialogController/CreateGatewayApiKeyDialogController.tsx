import { useState, type ComponentProps, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { ConnectedCreateGatewayApiKeyDialog } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/ConnectedCreateGatewayApiKeyDialog/ConnectedCreateGatewayApiKeyDialog";
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
    typeof ConnectedCreateGatewayApiKeyDialog
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
          <Dialog
            title="Gateway key created"
            size="md"
            closeLabel="Done"
            requireExplicitClose
          >
            <GeneratedKeyContent
              organizationId={organizationId}
              secretKey={generatedSecretKey}
            />
          </Dialog>
        ) : (
          <ConnectedCreateGatewayApiKeyDialog
            organizationId={organizationId}
            isOpen={isOpen}
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
