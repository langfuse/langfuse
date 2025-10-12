import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import Header from "@/src/components/layouts/header";
import { useTranslation } from "react-i18next";

export const SSOSettings = () => {
  const { t } = useTranslation();
  const hasEntitlement = useHasEntitlement("cloud-multi-tenant-sso");

  const commonContent = (
    <>
      <Header title={t("organization.settings.ssoConfiguration")} />
      <p className="mb-4 text-sm text-muted-foreground">
        {t("organization.settings.ssoDescription")}
      </p>
    </>
  );

  if (!hasEntitlement) {
    return (
      <div>
        {commonContent}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("organization.settings.notAvailable")}</AlertTitle>
          <AlertDescription>
            {t("organization.settings.ssoNotAvailableDescription")}
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
        <AlertTitle>{t("organization.settings.contactSupport")}</AlertTitle>
        <AlertDescription>
          {t("organization.settings.contactSupportDescription")}
        </AlertDescription>
      </Alert>
    </div>
  );
};
