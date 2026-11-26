import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useState, type ReactNode } from "react";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";

export function DeletePromptDialogController({
  promptName,
  children,
}: {
  promptName: string;
  children: (controls: { disabled: boolean; onClick: () => void }) => ReactNode;
}) {
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  const mutDeletePrompt = api.prompts.delete.useMutation({
    onSuccess: () => {
      utils.prompts.invalidate();
      setError(null);
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const disabled = !hasAccess || !projectId;

  return (
    <ConfirmationDialogController
      title="Please confirm"
      text={`This action permanently deletes this prompt. All requests to fetch prompt "${promptName}" will error.`}
      confirmLabel="Delete Prompt"
      variant="destructive"
      disabled={disabled}
      loading={mutDeletePrompt.isPending}
      error={error ?? undefined}
      onAfterDismiss={() => setError(null)}
      onConfirm={async () => {
        if (!projectId) {
          throw new Error("Project ID is missing");
        }
        setError(null);
        await mutDeletePrompt.mutateAsync({
          projectId,
          promptName,
        });
      }}
    >
      {({ openDialog }) =>
        children({
          disabled,
          onClick: () => {
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
}
