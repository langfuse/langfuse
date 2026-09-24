import { useState } from "react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";
import {
  VerifiedDomainsSettingsTable,
  type DomainRowData,
} from "./VerifiedDomainsSettingsTable";
import { VerifyDomainDialogController } from "../VerifyDomainDialogController/VerifyDomainDialogController";

export function ConnectedVerifiedDomainsSettingsTable({
  orgId,
}: {
  orgId: string;
}) {
  const query = api.verifiedDomain.list.useQuery({ orgId });
  const utils = api.useUtils();
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(
    null,
  );

  const verifyMutation = api.verifiedDomain.verify.useMutation({
    onSuccess: (_, variables) => {
      utils.verifiedDomain.list.invalidate({ orgId });
      utils.ssoConfig.get.invalidate({ orgId });
      const domain = query.data?.find((row) => row.id === variables.id);
      showSuccessToast({
        title: "Domain verified",
        description: `${domain?.domain ?? "Domain"} is now verified.`,
      });
    },
    onError: (err) => showErrorToast("Verification failed", err.message),
    onSettled: () => setVerifyingDomainId(null),
  });

  const deleteMutation = api.verifiedDomain.delete.useMutation({
    onSuccess: (_, variables) => {
      utils.verifiedDomain.list.invalidate({ orgId });
      const domain = query.data?.find((row) => row.id === variables.id);
      showSuccessToast({
        title: "Domain removed",
        description: `${domain?.domain ?? "Domain"} has been removed.`,
      });
    },
    onError: (err) => showErrorToast("Failed to remove domain", err.message),
  });

  let data: AsyncTableData<DomainRowData[]> = {
    status: "success",
    data: query.data ?? [],
  };
  if (query.isLoading) data = { status: "loading" };
  if (query.isError) {
    data = {
      status: "error",
      error: "Failed to load verified domains. Please try again.",
    };
  }

  return (
    <ConfirmationDialogController<DomainRowData>
      title={(row) => `Remove ${row.domain}?`}
      text={(row) =>
        row.verifiedAt
          ? "If an SSO configuration exists for this domain, you must remove it first. The domain can be re-verified later."
          : "This removes the pending claim. The domain can be re-added and verified later."
      }
      confirmLabel="Remove"
      variant="destructive"
      loading={deleteMutation.isPending}
      onConfirm={async (row) => {
        await deleteMutation.mutateAsync({ orgId, id: row.id });
      }}
    >
      {({ openDialog: openDeleteDialog }) => (
        <VerifyDomainDialogController
          verifyingDomainId={verifyingDomainId}
          onVerify={async (row) => {
            setVerifyingDomainId(row.id);
            await verifyMutation.mutateAsync({ orgId, id: row.id });
          }}
        >
          {({ openDialog: openVerifyDialog }) => (
            <VerifiedDomainsSettingsTable
              data={data}
              verifyingDomainId={verifyingDomainId}
              onViewInstructions={openVerifyDialog}
              onDelete={openDeleteDialog}
            />
          )}
        </VerifyDomainDialogController>
      )}
    </ConfirmationDialogController>
  );
}
