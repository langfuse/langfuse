import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type ReactNode } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { TRPCClientError } from "@trpc/client";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  DeleteOrganizationDialog,
  type DeleteOrganizationDialogStatus,
} from "@/src/features/organizations/components/DeleteOrganizationDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  api,
  reportNonTrpcError,
  reportTrpcErrorWithoutToast,
} from "@/src/utils/api";

const ONLY_OWNERS_CAN_DELETE_ORGANIZATION =
  "Only owners can delete the organization";

type DeleteOrganizationDialogControllerProps = {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

/** organizations.delete throws this while soft-deleted projects are still purging. */
function isProjectsStillDeletingError(error: unknown): boolean {
  return (
    error instanceof TRPCClientError &&
    error.data?.code === "PRECONDITION_FAILED"
  );
}

function mutationInlineError(error: unknown): string | undefined {
  if (!error || isProjectsStillDeletingError(error)) return undefined;
  if (error instanceof TRPCClientError) return error.message;
  return "The organization could not be deleted.";
}

function deletionDialogStatus(input: {
  hasAccess: boolean;
  hasLiveProjects: boolean;
  hasOrganization: boolean;
  pendingDeletion: {
    data: boolean | undefined;
    isError: boolean;
    isFetching: boolean;
    isSuccess: boolean;
  };
  deleteError: unknown;
}): DeleteOrganizationDialogStatus {
  const projectsStillDeleting =
    input.pendingDeletion.data === true ||
    isProjectsStillDeletingError(input.deleteError);
  if (input.hasLiveProjects) return "has-projects";
  if (projectsStillDeleting) return "projects-deleting";
  if (!input.hasAccess || !input.hasOrganization) return "confirm";
  if (input.pendingDeletion.isError && !input.pendingDeletion.isFetching) {
    return "check-failed";
  }
  if (!input.pendingDeletion.isSuccess) return "loading";
  return "confirm";
}

export function DeleteOrganizationDialogController({
  children,
}: DeleteOrganizationDialogControllerProps) {
  const router = useRouter();
  const session = useSession();
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const confirmMessage =
    organization?.name.replaceAll(" ", "-").toLowerCase() ?? "organization";
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:delete",
  });
  const deleteOrganization = api.organizations.delete.useMutation({
    // Local onError replaces the global mutation toast. Every failure stays
    // in the dialog; unexpected codes are still reported from here.
    onError: (error) => reportTrpcErrorWithoutToast(error, "organizations"),
  });
  const hasLiveProjects = !!organization && organization.projects.length > 0;
  const checkPendingDeletion =
    Boolean(organization?.id) && hasAccess && !hasLiveProjects;
  const pendingDeletion = api.organizations.projectsPendingDeletion.useQuery(
    { orgId: organization?.id ?? "" },
    {
      enabled: checkPendingDeletion,
      meta: { silentAllErrors: true },
    },
  );

  const disabled = hasAccess
    ? undefined
    : { reason: ONLY_OWNERS_CAN_DELETE_ORGANIZATION };

  const status = deletionDialogStatus({
    hasAccess,
    hasLiveProjects,
    hasOrganization: Boolean(organization),
    pendingDeletion,
    deleteError: deleteOrganization.error,
  });

  const onSubmit = async (closeDialog: () => void) => {
    if (!organization || status !== "confirm" || !hasAccess) return;
    try {
      await deleteOrganization.mutateAsync({
        orgId: organization.id,
      });
      capture("organization_settings:delete_organization");
      closeDialog();
      showSuccessToast({
        operation: "organization.delete",
        title: "Organization Deleted",
        description: "The organization has been successfully deleted.",
      });
      // Refresh the session first so the landing page no longer lists the deleted organization.
      await session.update();
      await router.push("/");
    } catch (error) {
      // tRPC failures are classified in the mutation onError, with the toast
      // suppressed. Only report failures of the post-success work here.
      reportNonTrpcError(error, "organizations");
    }
  };

  return (
    <DialogController
      onDismiss={() => {
        deleteOrganization.reset();
      }}
      renderDialog={({ closeDialog }) => (
        <DeleteOrganizationDialog
          confirmMessage={confirmMessage}
          deleteDisabledReason={disabled?.reason}
          inlineError={mutationInlineError(deleteOrganization.error)}
          isSubmitting={deleteOrganization.isPending}
          onConfirm={() => onSubmit(closeDialog)}
          status={status}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            if (!hasAccess) return;
            if (checkPendingDeletion) {
              pendingDeletion.refetch().catch(() => undefined);
            }
            openDialog();
          },
        })
      }
    </DialogController>
  );
}
