import Header from "@/src/components/layouts/header";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { Card } from "@/src/components/ui/card";
import { IntegrationSettingsSkeleton } from "@/src/features/analytics-integrations";
import { BlobStorageIntegrationContainer } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationContainer/BlobStorageIntegrationContainer";
import { BlobStorageIntegrationTable } from "@/src/features/blobstorage-integration/components/BlobStorageIntegrationTable/BlobStorageIntegrationTable";
import { BlobStorageStatusSection } from "@/src/features/blobstorage-integration/components/BlobStorageStatusSection";
import { type RouterOutputs } from "@/src/utils/api";

type BlobStorageIntegrationData =
  RouterOutputs["blobStorageIntegration"]["get"];
type BlobStorageIntegrationConfig =
  BlobStorageIntegrationData["configs"][number];

export function BlobStorageSettingsContent({
  projectId,
  integrationId,
  hasAccess,
  hasEntitlement,
  data,
  showMediaStorage,
  deleteAction,
  onOpenIntegration,
  onCloseIntegration,
}: {
  projectId: string;
  integrationId: string | undefined;
  hasAccess: boolean;
  hasEntitlement: boolean;
  data: BlobStorageIntegrationData | undefined;
  showMediaStorage: boolean;
  deleteAction: {
    isPending: boolean;
    error: string | undefined;
    reset: () => void;
    execute: (integrationId: string) => Promise<void>;
  };
  onOpenIntegration: (integrationId: string) => void;
  onCloseIntegration: () => void;
}) {
  if (!hasEntitlement) {
    return (
      <p className="text-sm">
        This feature is not available in your current plan.
      </p>
    );
  }
  if (!hasAccess) {
    return (
      <p className="text-sm">
        Your current role does not grant you access to these settings, please
        reach out to your project admin or owner.
      </p>
    );
  }
  if (!data) return <IntegrationSettingsSkeleton />;

  const showDetails = Boolean(integrationId);
  if (!showDetails) {
    return (
      <ConfirmationDialogController<BlobStorageIntegrationConfig>
        title="Delete blob storage integration"
        text={(integration) =>
          `Delete the integration for “${integration.bucketName}”? This action cannot be undone.`
        }
        confirmLabel="Delete integration"
        variant="destructive"
        loading={deleteAction.isPending}
        error={deleteAction.error}
        onAfterDismiss={deleteAction.reset}
        onConfirm={(integration) => deleteAction.execute(integration.id)}
      >
        {({ openDialog }) => (
          <BlobStorageIntegrationTable
            integrations={data.configs}
            showMediaStorage={showMediaStorage}
            onSelect={(integration) => onOpenIntegration(integration.id)}
            onDelete={openDialog}
          />
        )}
      </ConfirmationDialogController>
    );
  }

  const selectedConfig =
    integrationId === "new"
      ? null
      : data.configs.find((config) => config.id === integrationId);
  if (integrationId !== "new" && !selectedConfig) {
    return (
      <Card className="p-4 text-sm">
        This blob storage integration could not be found.
      </Card>
    );
  }

  return (
    <>
      {selectedConfig ? (
        <BlobStorageStatusSection config={selectedConfig} />
      ) : null}
      <Header title="Integration details" className="mt-8" />
      <BlobStorageIntegrationContainer
        config={selectedConfig ?? null}
        projectId={projectId}
        writeMode={data.writeMode}
        showMediaStorage={showMediaStorage}
        onDeleted={onCloseIntegration}
        onSaved={onOpenIntegration}
      />
    </>
  );
}
