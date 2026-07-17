import Header from "@/src/components/layouts/header";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Card } from "@/src/components/ui/card";
import { BlobStorageExportMode } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";

type BlobStorageIntegrationConfig = NonNullable<
  RouterOutputs["blobStorageIntegration"]["get"]["config"]
>;

const EXPORT_MODE_LABELS: Record<BlobStorageExportMode, string> = {
  [BlobStorageExportMode.FULL_HISTORY]: "Full history",
  [BlobStorageExportMode.FROM_TODAY]: "From setup date",
  [BlobStorageExportMode.FROM_CUSTOM_DATE]: "From custom date",
};

export const BlobStorageStatusSection = ({
  config,
}: {
  config: BlobStorageIntegrationConfig;
}) => {
  return (
    <>
      <Header title="Status" />
      {config.lastError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Last export failed</AlertTitle>
          <AlertDescription>
            {config.lastError}
            {config.lastErrorAt && (
              <>
                <br />
                <span className="text-xs opacity-70">
                  {new Date(config.lastErrorAt).toLocaleString()}
                </span>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Card className="p-3">
        <div className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Data exported up to</span>
          <span>
            {config.lastSyncAt
              ? new Date(config.lastSyncAt).toLocaleString()
              : "Never (pending)"}
          </span>
          {config.nextSyncAt && (
            <>
              <span className="text-muted-foreground">
                Next export scheduled
              </span>
              <span>{new Date(config.nextSyncAt).toLocaleString()}</span>
            </>
          )}
          <span className="text-muted-foreground">Export mode</span>
          <span>{EXPORT_MODE_LABELS[config.exportMode] ?? "Unknown"}</span>
          {(config.exportMode === BlobStorageExportMode.FROM_CUSTOM_DATE ||
            config.exportMode === BlobStorageExportMode.FROM_TODAY) &&
            config.exportStartDate && (
              <>
                <span className="text-muted-foreground">Export start date</span>
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
