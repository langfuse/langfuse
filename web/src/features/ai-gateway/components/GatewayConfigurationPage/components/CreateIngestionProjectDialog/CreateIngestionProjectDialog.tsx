import { useState } from "react";
import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogController,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import type { IngestionMode } from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/GatewayConfigurationView/GatewayConfigurationView";
import { DEFAULT_GATEWAY_INGESTION_PROJECT_NAME } from "@/src/features/ai-gateway/constants/gatewayConfig";

export type CreateIngestionProjectDialogProps = {
  ingestionMode: IngestionMode;
  isSaving: boolean;
  onCreate: (values: {
    projectName: string;
    ingestionMode: IngestionMode;
  }) => void | Promise<void>;
  triggerLabel: string;
  showIcon?: boolean;
};

export function CreateIngestionProjectDialog({
  ingestionMode,
  isSaving,
  onCreate,
  triggerLabel,
  showIcon = false,
}: CreateIngestionProjectDialogProps) {
  const [projectName, setProjectName] = useState(
    DEFAULT_GATEWAY_INGESTION_PROJECT_NAME,
  );

  return (
    <DialogController
      size="default"
      closeOnInteractionOutside={false}
      onBeforeClose={() => !isSaving}
      onDismiss={() => setProjectName(DEFAULT_GATEWAY_INGESTION_PROJECT_NAME)}
      renderContent={() => (
        <>
          <DialogHeader>
            <DialogTitle>Create ingestion project</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div>
              <Label htmlFor="gateway-project-name">Project name</Label>
              <Input
                id="gateway-project-name"
                className="ph-no-capture mt-1.5"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <p className="text-muted-foreground mt-1.5 text-xs">
                Project access follows organization roles and can be restricted
                in project settings.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              disabled={!projectName.trim() || isSaving}
              loading={isSaving}
              onClick={() =>
                onCreate({
                  projectName: projectName.trim(),
                  ingestionMode,
                })
              }
            >
              Create project
            </Button>
          </DialogFooter>
        </>
      )}
    >
      {({ openDialog }) =>
        showIcon ? (
          <Button onClick={openDialog}>
            <Plus size="base" __rawClassName="mr-1.5" />
            {triggerLabel}
          </Button>
        ) : (
          <button
            type="button"
            className="text-primary text-sm hover:underline"
            onClick={openDialog}
          >
            {triggerLabel}
          </button>
        )
      }
    </DialogController>
  );
}
