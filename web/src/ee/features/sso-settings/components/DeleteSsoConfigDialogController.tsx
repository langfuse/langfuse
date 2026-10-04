import { useState } from "react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

export function DeleteSsoConfigDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (control: {
    openDialog: (domain: string) => void;
  }) => React.ReactNode;
}) {
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const utils = api.useUtils();

  const deleteMutation = api.ssoConfig.delete.useMutation({
    onSuccess: () => {
      utils.ssoConfig.get.invalidate({ orgId });
      showSuccessToast({
        title: "SSO disabled",
        description: `SSO for @${selectedDomain} has been removed.`,
      });
    },
    onError: (err) => {
      showErrorToast("Failed to remove SSO", err.message);
    },
  });

  return (
    <ConfirmationDialogController
      title={`Remove SSO for @${selectedDomain ?? "this domain"}?`}
      text="Users at this domain will be able to sign in with any enabled method again. Active sessions are not invalidated."
      confirmLabel="Remove"
      variant="destructive"
      loading={deleteMutation.isPending}
      onConfirm={async () => {
        if (!selectedDomain) return;
        await deleteMutation.mutateAsync({ orgId, domain: selectedDomain });
      }}
    >
      {({ openDialog }) =>
        children({
          openDialog: (domain) => {
            setSelectedDomain(domain);
            openDialog();
          },
        })
      }
    </ConfirmationDialogController>
  );
}
