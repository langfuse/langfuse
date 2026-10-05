import { Plus } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";

export function BlobStorageIntegrationHeaderActions({
  canLoadConfig,
  showDetails,
  onAddIntegration,
}: {
  canLoadConfig: boolean;
  showDetails: boolean;
  onAddIntegration: () => void;
}) {
  return (
    <>
      <Button
        text="Integration Docs"
        href="https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage"
        variant="secondary"
      />
      {!showDetails && canLoadConfig ? (
        <Button text="Add integration" icon={Plus} onClick={onAddIntegration} />
      ) : null}
    </>
  );
}
