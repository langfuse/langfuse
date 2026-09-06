import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert } from "@/src/components/design-system/Alert/Alert";

export const SupportOrUpgradePage = () => {
  const t = useTranslations("settingsEnterprise.billing.support");
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Alert icon={AlertCircle}>
          <Alert.Title>{t("title")}</Alert.Title>
          <Alert.Description>
            <p className="mb-2">{t("permissions")}</p>
            <p>{t("description")}</p>
          </Alert.Description>
        </Alert>
      </div>
    </div>
  );
};
