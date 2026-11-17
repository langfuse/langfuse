import { useRouter } from "next/router";
import { type ReactNode, useMemo, useState } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
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

  const disabled = useMemo(() => {
    if (!hasAccess) {
      return { reason: "You don't have permission to delete this trace." };
    }
    if (!hasEntitlement) {
      return { reason: "Trace deletion is not available on your plan." };
    }
    return undefined;
  }, [hasAccess, hasEntitlement]);

  return (
    <ConfirmationDialogController<{
      projectId: string;
      traceId: string;
      traceName?: string | null;
      redirectUrl?: string;
      onAfterDelete?: (deletedTraceId: string) => void;
    }>
      title={(target) => `Delete trace ${target.traceName || target.traceId}?`}
      text="This action cannot be undone. It removes all the data associated with this trace. If this is the project default, it will be deleted for all users."
      confirmationText={(target) => target.traceName || ""}
      confirmLabel="Delete trace"
      variant="destructive"
      loading={deleteMutation.isPending || isDeleted}
      error={deleteMutation.error?.message}
      onConfirm={async (target) => {
        await deleteMutation.mutateAsync({
          traceIds: [target.traceId],
          projectId: target.projectId,
        });
        setIsDeleted(true);
        showSuccessToast({
          operation: "trace.delete",
          title: "Trace deleted",
          description:
            "Selected trace will be deleted. Traces are removed asynchronously and may continue to be visible for up to 24 hours.",
        });
        capture("trace:delete", { source: "trace" });
        if (target.redirectUrl) {
          router.push(target.redirectUrl).catch(() => undefined);
          return;
        }
        utils.invalidate();
        target.onAfterDelete?.(target.traceId);
      }}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            capture("trace:delete_form_open", { source: "trace detail" });
            setIsDeleted(false);
            deleteMutation.reset();
            openDialog({
              projectId,
              traceId,
              traceName,
              redirectUrl,
              onAfterDelete,
            });
          },
        })
      }
    </ConfirmationDialogController>
  );
}
