import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useTranslations } from "next-intl";
import { Alert } from "@/src/components/design-system/Alert/Alert";

interface AutomationFailureBannerProps {
  failureCount: number;
  onDismiss: () => void;
}

export const AutomationFailureBanner = ({
  failureCount,
  onDismiss,
}: AutomationFailureBannerProps) => {
  const t = useTranslations("remainderUi.automations.failure");
  return (
    <div className="mb-4">
      <Alert variant="destructive" icon={AlertTriangle}>
        <Alert.Description>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <strong>{t("title", { count: failureCount })}</strong>
              <div className="mt-2 text-sm">{t("description")}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="ml-4 h-6 w-6 p-0"
              aria-label={t("dismiss")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert.Description>
      </Alert>
    </div>
  );
};
