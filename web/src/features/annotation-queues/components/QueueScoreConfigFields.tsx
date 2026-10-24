import { type ScoreConfigDomain } from "@langfuse/shared";
import {
  CreateScoreConfigDialogController,
  EditScoreConfigDialogController,
} from "@/src/features/score-configs";
import { AnnotationQueueScoreConfigEditor } from "./AnnotationQueueScoreConfigEditor";

export function QueueScoreConfigFields({
  projectId,
  configs,
  value,
  onChange,
  disabled,
  warnOnRemoval,
}: {
  projectId: string;
  configs: ScoreConfigDomain[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  warnOnRemoval: boolean;
}) {
  return (
    <CreateScoreConfigDialogController
      projectId={projectId}
      onAfterCreate={(config) => onChange([...value, config.id])}
    >
      {(create) => (
        <EditScoreConfigDialogController projectId={projectId}>
          {(edit) => (
            <AnnotationQueueScoreConfigEditor
              scoreConfigs={configs}
              value={value}
              onChange={onChange}
              disabled={disabled}
              warnOnRemoval={warnOnRemoval}
              createAction={{
                disabled: create.disabled,
                onClick: create.openDialog,
              }}
              editAction={{
                disabled: edit.disabled,
                onClick: (configId) => {
                  const config = configs.find(
                    (candidate) => candidate.id === configId,
                  );
                  if (!config) return;
                  edit.openDialog({
                    id: config.id,
                    name: config.name,
                    dataType: config.dataType,
                    description: config.description ?? undefined,
                    minValue: config.minValue ?? undefined,
                    maxValue: config.maxValue ?? undefined,
                    categories: config.categories ?? undefined,
                  });
                },
              }}
            />
          )}
        </EditScoreConfigDialogController>
      )}
    </CreateScoreConfigDialogController>
  );
}
