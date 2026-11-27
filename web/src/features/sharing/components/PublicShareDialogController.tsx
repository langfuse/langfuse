import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { PublicShareConfirmationDialog } from "@/src/features/sharing/components/PublicShareConfirmationDialog";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";

/** Opens the confirmation; `onConfirm` publishes once the user agrees. */
export type OpenPublicShareDialog = (request: {
  onConfirm: () => void;
}) => void;

type PublicShareRequest = { onConfirm: () => void };

/**
 * Asks before a trace or session goes public, and offers inviting teammates
 * instead, which leaves it private. Wraps whatever triggers Make Public.
 */
export function PublicShareDialogController({
  kind,
  objectId,
  children,
}: {
  kind: "trace" | "session";
  /** The trace or session on the page; a confirmation opened for another one closes. */
  objectId: string;
  children: (control: { openShareDialog: OpenPublicShareDialog }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  // The trace or session the confirmation is open for. Cleared when the page
  // moves to another one, and when the invite dialog opens: the confirmation is
  // then gone at once, so its closing never takes the focus back.
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (shownFor !== null && shownFor !== objectId) setShownFor(null);
  return (
    <CreateProjectMemberDialogController
      surface={`${kind}_share`}
      // They are being invited to look at something, so Viewer is the start.
      defaultOrgRole="VIEWER"
    >
      {({ hasAccess: canInvite, openDialog: openInviteDialog }) => (
        <DialogController<PublicShareRequest>
          onDismiss={() => capture("public_share:dialog_cancel", { kind })}
          renderDialog={({ state: request, closeDialog }) =>
            shownFor === objectId && (
              <PublicShareConfirmationDialog
                kind={kind}
                onConfirm={() => {
                  capture("public_share:dialog_confirm", { kind });
                  closeDialog();
                  request.onConfirm();
                }}
                onInvite={
                  canInvite
                    ? () => {
                        capture("public_share:invite_instead_click", { kind });
                        setShownFor(null);
                        closeDialog();
                        openInviteDialog();
                      }
                    : undefined
                }
              />
            )
          }
        >
          {({ openDialog }) =>
            children({
              openShareDialog: ({ onConfirm }) => {
                setShownFor(objectId);
                openDialog({ onConfirm });
              },
            })
          }
        </DialogController>
      )}
    </CreateProjectMemberDialogController>
  );
}
