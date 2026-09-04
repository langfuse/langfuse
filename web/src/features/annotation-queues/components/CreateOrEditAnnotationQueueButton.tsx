import { type ButtonProps } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { Edit, Pen, PlusIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import { ActionButton } from "@/src/components/ActionButton";
import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";

export const CreateOrEditAnnotationQueueButton = ({
  projectId,
  queueId,
  variant = "secondary",
  size,
  isTableAction = false,
}: {
  projectId: string;
  queueId?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  isTableAction?: boolean;
}) => {
  const hasQueueAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const queueLimit = useEntitlementLimit("annotation-queue-count");

  const queueCountData = api.annotationQueues.count.useQuery(
    { projectId },
    // The count only feeds the create button's limit check; skip it when
    // editing (e.g. the per-row table action button) where it goes unused.
    { enabled: hasQueueAccess && !queueId },
  );

  const controllerProps = queueId
    ? ({ mode: "edit", queueId } as const)
    : ({ mode: "create" } as const);

  return (
    <AnnotationQueueFormDialogController
      {...controllerProps}
      projectId={projectId}
      onSuccess={() => undefined}
    >
      {({ disabled, openDialog }) =>
        isTableAction ? (
          <IconOnlyButton
            icon={<Pen className="h-4 w-4" />}
            label="Edit"
            aria-label="edit"
            disabledReason={disabled?.reason}
            onClick={(event) => {
              event.stopPropagation();
              openDialog();
            }}
          />
        ) : (
          <ActionButton
            variant={variant}
            onClick={openDialog}
            icon={
              queueId ? (
                <Edit className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PlusIcon className="h-4 w-4" aria-hidden="true" />
              )
            }
            hasAccess={!disabled}
            usageLimit={
              typeof queueLimit === "number"
                ? { current: queueCountData.data, max: queueLimit }
                : undefined
            }
            size={size}
          >
            <span className="ml-1 text-sm font-normal">
              {queueId ? "Edit" : "New queue"}
            </span>
          </ActionButton>
        )
      }
    </AnnotationQueueFormDialogController>
  );
};
