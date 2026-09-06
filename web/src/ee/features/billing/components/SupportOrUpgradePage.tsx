import { AlertCircle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";
import { useTranslations } from "next-intl";

export const SupportOrUpgradePage = () => {
  const t = useTranslations("settingsEnterprise.billing.support");
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("title")}</AlertTitle>
          <AlertDescription>
            <p className="mb-2">{t("permissions")}</p>
            <p>{t("description")}</p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
};
