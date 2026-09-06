import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Card } from "@/src/components/ui/card";
import { BlobStorageExportMode } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { useTranslations } from "next-intl";

type BlobStorageIntegrationConfig = NonNullable<
  RouterOutputs["blobStorageIntegration"]["get"]["config"]
>;

export const BlobStorageStatusSection = ({
  config,
}: {
  config: BlobStorageIntegrationConfig;
}) => {
  const t = useTranslations("integrationsSettings");
  return (
    <>
      <Header title={t("common.status")} />
      {config.lastError && (
        <div className="mb-4">
          <Alert variant="destructive">
            <Alert.Title>
              {t("blobStorage.status.lastExportFailed")}
            </Alert.Title>
            <Alert.Description>
              {config.lastError}
              {config.lastErrorAt && (
                <>
                  <br />
                  <span className="text-xs opacity-70">
                    {new Date(config.lastErrorAt).toLocaleString()}
                  </span>
                </>
              )}
            </Alert.Description>
          </Alert>
        </div>
      )}
      <Card className="p-3">
        <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {t("blobStorage.status.exportedUpTo")}
          </span>
          <span>
            {config.lastSyncAt
              ? new Date(config.lastSyncAt).toLocaleString()
              : t("common.neverPending")}
          </span>
          {config.nextSyncAt && (
            <>
              <span className="text-muted-foreground">
                {t("blobStorage.status.nextScheduled")}
              </span>
              <span>{new Date(config.nextSyncAt).toLocaleString()}</span>
            </>
          )}
          <span className="text-muted-foreground">
            {t("blobStorage.status.exportMode")}
          </span>
          <span>
            {config.exportMode === BlobStorageExportMode.FULL_HISTORY
              ? t("blobStorage.status.fullHistory")
              : config.exportMode === BlobStorageExportMode.FROM_TODAY
                ? t("blobStorage.status.fromSetupDate")
                : config.exportMode === BlobStorageExportMode.FROM_CUSTOM_DATE
                  ? t("blobStorage.status.fromCustomDate")
                  : t("blobStorage.status.unknown")}
          </span>
          {(config.exportMode === BlobStorageExportMode.FROM_CUSTOM_DATE ||
            config.exportMode === BlobStorageExportMode.FROM_TODAY) &&
            config.exportStartDate && (
              <>
                <span className="text-muted-foreground">
                  {t("blobStorage.status.startDate")}
                </span>
                <span>
                  {new Date(config.exportStartDate).toLocaleDateString()}
                </span>
              </>
            )}
        </div>
      </Card>
    </>
  );
};
