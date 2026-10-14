import { type ButtonProps } from "@/src/app/design-system/legacy-primitives/button";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { Edit, Pen, PlusIcon } from "lucide-react";
import { api } from "@/src/app/utils/api";
import { useEntitlementLimit } from "@/src/entitlements";
import { ActionButton } from "@/src/app/components/ActionButton";
import { IconOnlyButton } from "@/src/app/components/IconOnlyButton";
import { AnnotationQueueFormDialogController } from "@/src/annotation/queues/components/AnnotationQueueFormDialogController";

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
            icon={<Pen className="icon-base" />}
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
                <Edit className="icon-base" aria-hidden="true" />
              ) : (
                <PlusIcon className="icon-base" aria-hidden="true" />
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
