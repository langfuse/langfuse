import { AlertCircle, Settings } from "lucide-react";
import Link from "next/link";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { useTranslations } from "next-intl";

interface NoModelConfiguredAlertProps {
  projectId: string;
}

export function NoModelConfiguredAlert({
  projectId,
}: NoModelConfiguredAlertProps) {
  const t = useTranslations("coreDetails.playground.noModel");

  return (
    <div className="p-4">
      <Alert variant="warning" icon={AlertCircle}>
        <Alert.Title>{t("title")}</Alert.Title>
        <Alert.Description>
          {t("descriptionBefore")}{" "}
          <Link
            href={`/project/${projectId}/settings/llm-connections`}
            className="font-bold underline underline-offset-4 hover:text-yellow-900 dark:hover:text-yellow-300"
          >
            <Settings className="inline h-3 w-3" /> {t("settings")}
          </Link>{" "}
          {t("descriptionAfter")}
        </Alert.Description>
      </Alert>
    </div>
  );
}
