import { type ReactNode } from "react";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { Button } from "@/src/components/design-system/Button/Button";
import Header from "@/src/components/layouts/header";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { AddDomainDialogController } from "./AddDomainDialogController/AddDomainDialogController";
import { ConnectedVerifiedDomainsSettingsTable } from "./VerifiedDomainsSettingsTable/ConnectedVerifiedDomainsSettingsTable";

export const VerifiedDomainsSettings = ({ orgId }: { orgId: string }) => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const heading = (
    <>
      <Header title="Verified Domains" />
      <p className="text-muted-foreground mb-4 text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {heading}
        <Banner title="Not available">
          Verified Domains and Enterprise SSO are not available on your plan.
          Please upgrade to access this feature.
        </Banner>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div>
        {heading}
        <Banner title="Access denied">
          You do not have permission to manage verified domains for this
          organization.
        </Banner>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="Verified Domains"
        actionButtons={
          <ConnectedAddDomainDialogController orgId={orgId}>
            {({ openDialog }) => (
              <Button
                type="button"
                size="sm"
                onClick={openDialog}
                text="Add Domain"
              />
            )}
          </ConnectedAddDomainDialogController>
        }
      />
      <p className="text-muted-foreground text-sm">
        You can only configure SSO for domains your organization owns. Verify a
        domain via DNS to enable SSO for it.
      </p>
      <ConnectedVerifiedDomainsSettingsTable orgId={orgId} />
    </div>
  );
};

function ConnectedAddDomainDialogController({
  orgId,
  children,
}: {
  orgId: string;
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const utils = api.useUtils();

  const createMutation = api.verifiedDomain.create.useMutation({
    onSuccess: () => {
      utils.verifiedDomain.list.invalidate({ orgId });
      showSuccessToast({
        operation: "verified_domain.add",
        title: "Domain added",
        description:
          "Click Verify to view the DNS TXT record, then confirm after adding it.",
      });
    },
    // Inline field errors are shown in AddDomainDialogController.
    onError: (error) => reportTrpcErrorWithoutToast(error, "verified-domains"),
  });

  async function onSubmitDomain(domain: string) {
    await createMutation.mutateAsync({ orgId, domain });
  }

  return (
    <AddDomainDialogController
      isSubmitting={createMutation.isPending}
      onSubmitDomain={onSubmitDomain}
    >
      {children}
    </AddDomainDialogController>
  );
}
