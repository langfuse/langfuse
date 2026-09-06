import { DeleteButton } from "@/src/components/deleteButton";
import { api } from "@/src/utils/api";
import { useTranslations } from "next-intl";

type DeleteAnnotationQueueButtonProps = {
  projectId: string;
  queueId: string;
};

export const DeleteAnnotationQueueButton = ({
  projectId,
  queueId,
}: DeleteAnnotationQueueButtonProps) => {
  const t = useTranslations("evaluationAnalytics.annotationQueues");
  const utils = api.useUtils();
  const deleteMutation = api.annotationQueues.delete.useMutation();

  return (
    <DeleteButton
      itemId={queueId}
      projectId={projectId}
      scope="annotationQueues:CUD"
      invalidateFunc={() => utils.annotationQueues.invalidate()}
      isTableAction
      icon
      variant="ghost"
      size="icon-xs"
      title={t("deleteAction")}
      aria-label={t("deleteAction")}
      captureDeleteOpen={() => undefined}
      captureDeleteSuccess={() => undefined}
      customDeletePrompt={t("deleteDescription")}
      entityToDeleteName={t("entityName")}
      executeDeleteMutation={async (onSuccess) => {
        await deleteMutation.mutateAsync({
          projectId,
          queueId,
        });
        onSuccess();
      }}
      isDeleteMutationLoading={deleteMutation.isPending}
    />
  );
};
