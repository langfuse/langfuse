import { AlertCircle, Settings } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
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
      <Alert
        variant="default"
        className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20"
      >
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-400">
          {t("title")}
        </AlertTitle>
        <AlertDescription className="text-yellow-700 dark:text-yellow-500">
          {t("descriptionBefore")}{" "}
          <Link
            href={`/project/${projectId}/settings/llm-connections`}
            className="font-bold underline underline-offset-4 hover:text-yellow-900 dark:hover:text-yellow-300"
          >
            <Settings className="inline h-3 w-3" /> {t("settings")}
          </Link>{" "}
          {t("descriptionAfter")}
        </AlertDescription>
      </Alert>
    </div>
  );
}
