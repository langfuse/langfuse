import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

type NoMatchDisplayProps = {
  modelName: string;
};

export type { NoMatchDisplayProps };

export function NoMatchDisplay({ modelName }: NoMatchDisplayProps) {
  const t = useTranslations("settingsEnterprise.models.testMatch");
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2 text-base">
          <AlertCircle className="h-5 w-5" />
          {t("noMatch")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{t("noMatchDescription", { modelName })}</p>

        <div>
          <p className="mb-2 text-sm font-bold">{t("suggestions")}</p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
            <li>{t("checkSpelling")}</li>
            <li>{t("viewPatterns")}</li>
            <li>{t("createDefinition")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
