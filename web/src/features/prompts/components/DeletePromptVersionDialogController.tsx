import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function DeletePromptVersionDialogController({
  promptVersionId,
  version,
  countVersions,
  children,
}: {
  promptVersionId: string;
  version: number;
  countVersions: number;
  children: (controls: { disabled: boolean; onClick: () => void }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const projectId = useProjectIdFromURL();
  const utils = api.useUtils();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const hasAccess = useHasProjectAccess({ projectId, scope: "prompts:CUD" });

  const mutDeletePromptVersion = api.prompts.deleteVersion.useMutation({
    onSuccess: () => {
      utils.prompts.invalidate();
      setError(null);
      if (countVersions > 1) {
        router.replace(
          {
            pathname: router.pathname,
            query: { ...router.query, version: undefined },
          },
          undefined,
          { shallow: true },
        );
      } else {
        router.push(`/project/${projectId}/prompts`);
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  return (
    <ConfirmationDialogController
      title="Please confirm"
      text={`This action deletes the prompt version. Requests of version ${version} of this prompt will return an error.`}
      confirmLabel="Delete prompt version"
      variant="destructive"
      disabled={!hasAccess || !projectId}
      loading={mutDeletePromptVersion.isPending}
      error={error ?? undefined}
      onAfterDismiss={() => setError(null)}
      onConfirm={async () => {
        if (!projectId || !hasAccess) {
          throw new Error("Prompt deletion is not available.");
        }
        capture("prompt_detail:version_delete_submit");
        setError(null);
        await mutDeletePromptVersion.mutateAsync({
          promptVersionId,
          projectId,
        });
      }}
    >
      {({ openDialog }) =>
        children({
          disabled: !hasAccess || !projectId,
          onClick: () => {
            capture("prompt_detail:version_delete_open");
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
}
