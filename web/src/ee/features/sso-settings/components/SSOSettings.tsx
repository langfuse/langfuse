import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { useSupportDrawer } from "@/src/features/support-chat/SupportDrawerProvider";

export const SSOSettings = () => {
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();

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
        <AlertDescription className="flex flex-col gap-3">
          <p>
            To set up or change your SSO configuration, please reach out to our
            support engineering team.
          </p>
          <Button
            onClick={() => setSupportDrawerOpen(true)}
            className="self-start"
          >
            Contact Support
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
};
