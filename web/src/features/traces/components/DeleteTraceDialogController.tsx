import { useRouter } from "next/router";
import { type ReactNode, useMemo, useState } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { useHasEntitlement } from "@/src/features/entitlements";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { markTracesPendingDeletion } from "@/src/features/traces/pendingTraceDeletions";
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
    <ConfirmationDialogController
      title="Delete trace?"
      text="This action cannot be undone. It removes all the data associated with this trace. Trace deletion happens asynchronously and may take up to 24 hours."
      confirmationText={traceName || undefined}
      confirmLabel="Delete trace"
      variant="destructive"
      loading={deleteMutation.isPending || isDeleted}
      error={deleteMutation.error?.message}
      onConfirm={async () => {
        await deleteMutation.mutateAsync({ traceIds: [traceId], projectId });
        markTracesPendingDeletion(projectId, [traceId]);
        setIsDeleted(true);
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
