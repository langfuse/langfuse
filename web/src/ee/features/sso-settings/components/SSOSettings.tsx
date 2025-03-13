import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import Header from "@/src/components/layouts/header";

export const SSOSettings = () => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");

  const commonContent = (
    <>
      <Header title="SSO Configuration" />
      <p className="mb-4 text-sm text-muted-foreground">
        Configure Single Sign-On (SSO) for your organization. SSO allows your
        team to use your existing identity provider for authentication, e.g.
        Okta, AzureAD/EntraID. Alternatively, you can enforce the use of a
        public provider such as Google, GitHub and Microsoft.
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {commonContent}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription>
            Enterprise SSO and SSO Enforcement are not available on your plan.
            Please upgrade to access this feature.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      {commonContent}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Contact Langfuse Support</AlertTitle>
        <AlertDescription>
          To set up or change your SSO configuration, please reach out to{" "}
          <a
            href="mailto:support@langfuse.com"
            className="font-medium underline underline-offset-4"
          >
            support@langfuse.com
          </a>
          .
        </AlertDescription>
      </Alert>
    </div>
  );
};
