import { FolderInput, Plus } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/design-system/Button/Button";
import { EmptyState } from "@/src/components/design-system/EmptyState/EmptyState";
import {
  CreateIngestionProjectDialogController,
  type CreateIngestionProjectDialogControllerProps,
} from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/CreateIngestionProjectDialogController/CreateIngestionProjectDialogController";
import {
  GATEWAY_CONFIGURATION_DESCRIPTION,
  GATEWAY_CONFIGURATION_TITLE,
} from "@/src/features/ai-gateway/constants/gatewayConfig";

export type IngestionProjectSetupPlaceholderProps = Pick<
  CreateIngestionProjectDialogControllerProps,
  "ingestionMode" | "isSaving" | "onCreate"
> & {
  onUseExistingProject: () => void;
};

export function IngestionProjectSetupPlaceholder({
  ingestionMode,
  isSaving,
  onCreate,
  onUseExistingProject,
}: IngestionProjectSetupPlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={GATEWAY_CONFIGURATION_TITLE} />
        <p className="text-muted-foreground text-sm">
          {GATEWAY_CONFIGURATION_DESCRIPTION}
        </p>
      </div>
      <EmptyState
        icon={FolderInput}
        title="Set up an ingestion project first"
        description="Gateway traffic needs a project to be recorded in. Credentials, models and API keys become available once it is set."
      >
        <CreateIngestionProjectDialogController
          ingestionMode={ingestionMode}
          isSaving={isSaving}
          onCreate={onCreate}
        >
          {({ openDialog }) => (
            <Button
              text="Create ingestion project"
              icon={Plus}
              onClick={openDialog}
            />
          )}
        </CreateIngestionProjectDialogController>
        <Button
          text="Use existing project"
          variant="secondary"
          onClick={onUseExistingProject}
        />
      </EmptyState>
    </div>
  );
}
