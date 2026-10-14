import { Alert } from "@/src/app/design-system/Alert/Alert";
import Header from "@/src/app/shell/layouts/header";
import { useHasEntitlement } from "@/src/entitlements";
import { useHasOrganizationAccess } from "@/src/identity/access-control";
import { VerifiedDomainsSettings } from "@/src/ee/identity/auth/verified-domains";
import { AlertCircle } from "lucide-react";
import { ConnectedSsoConfigsTable } from "./SsoConfigsTable/ConnectedSsoConfigsTable";

export const SSOSettings = ({ orgId }: { orgId: string }) => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });

  const heading = (
    <>
      <Header title="SSO Configuration" />
      <p className="text-muted-foreground mb-4 text-sm">
        Configure Single Sign-On per verified domain. Once active, every user
        signing in with that domain is redirected to your identity provider.
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div className="space-y-8">
        <VerifiedDomainsSettings orgId={orgId} />
        <div>
          {heading}
          <Alert icon={AlertCircle}>
            <Alert.Title>Not available</Alert.Title>
            <Alert.Description>
              Enterprise SSO is not available on your plan. Please upgrade to
              access this feature.
            </Alert.Description>
          </Alert>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="space-y-8">
        <VerifiedDomainsSettings orgId={orgId} />
        <div>
          {heading}
          <Alert>
            <Alert.Title>Access Denied</Alert.Title>
            <Alert.Description>
              You do not have permission to configure SSO for this organization.
            </Alert.Description>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <VerifiedDomainsSettings orgId={orgId} />
      <div className="space-y-6">
        {heading}
        <ConnectedSsoConfigsTable orgId={orgId} />
      </div>
    </div>
  );
};
