import { useRouter } from "next/router";
import { type ReactNode, useState } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasEntitlement } from "@/src/features/entitlements";
import { showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";

export function DeleteTraceDialogController({
  projectId,
  traceId,
  traceName,
  redirectUrl,
  onAfterDelete,
  children,
}: {
  projectId: string;
  traceId: string;
  traceName?: string | null;
  redirectUrl?: string;
  onAfterDelete?: (deletedTraceId: string) => void;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [isDeleted, setIsDeleted] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "traces:delete" });
  const hasEntitlement = useHasEntitlement("trace-deletion");
  const deleteMutation = api.traces.deleteMany.useMutation();

  let disabled: { reason: string } | undefined;
  if (!hasAccess) {
    disabled = { reason: "You don't have permission to delete this trace." };
  } else if (!hasEntitlement) {
    disabled = { reason: "Trace deletion is not available on your plan." };
  }

  return (
    <ConfirmationDialogController
      title="Delete trace?"
      text="This action cannot be undone. It removes all the data associated with this trace. If this is the project default, it will be deleted for all users."
      confirmationText={traceName || undefined}
      confirmLabel="Delete trace"
      variant="destructive"
      loading={deleteMutation.isPending || isDeleted}
      error={deleteMutation.error?.message}
      onConfirm={async () => {
        await deleteMutation.mutateAsync({ traceIds: [traceId], projectId });
        setIsDeleted(true);
        showSuccessToast({
          title: "Trace deleted",
          description:
            "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 24 hours.",
        });
        capture("trace:delete", { source: "trace" });
        if (redirectUrl) {
          router.push(redirectUrl).catch(() => undefined);
          return;
        }
        utils.invalidate();
        onAfterDelete?.(traceId);
      }}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            capture("trace:delete_form_open", { source: "trace detail" });
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
}
