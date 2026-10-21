import { FolderInput, Plus } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import {
  CreateIngestionProjectDialogController,
  type CreateIngestionProjectDialogControllerProps,
} from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/CreateIngestionProjectDialogController/CreateIngestionProjectDialogController";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import {
  GATEWAY_CONFIGURATION_DESCRIPTION,
  GATEWAY_CONFIGURATION_TITLE,
} from "@/src/features/ai-gateway/constants/gatewayConfig";

export type IngestionProjectSetupPlaceholderProps = Pick<
  CreateIngestionProjectDialogControllerProps,
  "ingestionMode" | "isSaving" | "onCreate"
> & {
  projects: ReadonlyArray<{ id: string; name: string }>;
  onSelectProject: (projectId: string) => void;
};

export function IngestionProjectSetupPlaceholder({
  ingestionMode,
  isSaving,
  onCreate,
  projects,
  onSelectProject,
}: IngestionProjectSetupPlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Header title={GATEWAY_CONFIGURATION_TITLE} />
        <p className="text-muted-foreground text-sm">
          {GATEWAY_CONFIGURATION_DESCRIPTION}
        </p>
      </div>
      <CreateIngestionProjectDialogController
        ingestionMode={ingestionMode}
        isSaving={isSaving}
        onCreate={onCreate}
      >
        {({ openDialog }) => (
          <GatewaySetupEmptyState
            icon={FolderInput}
            title="Set up an ingestion project first"
            description="Gateway traffic needs a project to be recorded in. Credentials, models and API keys become available once it is set."
            actions={[
              {
                type: "button",
                label: "Create ingestion project",
                icon: Plus,
                onClick: openDialog,
              },
              {
                type: "menu",
                label: "Use existing project",
                items: projects.map((project) => ({
                  id: project.id,
                  title: project.name,
                })),
                onSelect: onSelectProject,
                disabled: isSaving,
              },
            ]}
          />
        )}
      </CreateIngestionProjectDialogController>
    </div>
  );
}
