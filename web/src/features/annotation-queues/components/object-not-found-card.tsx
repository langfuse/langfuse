import { Card } from "@/src/components/ui/card";
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export const ObjectNotFoundCard = ({
  type,
}: {
  type: "TRACE" | "OBSERVATION" | "SESSION";
}) => {
  const t = useTranslations("evaluationAnalytics.annotationQueues");
  const typeLabel =
    type === "TRACE"
      ? t("objectTypes.TRACE")
      : type === "OBSERVATION"
        ? t("objectTypes.OBSERVATION")
        : t("objectTypes.SESSION");

  return (
    <Card className="flex h-full w-full items-center justify-center border-none p-6">
      <div className="text-center">
        <SearchXIcon className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          {t("objectNotFound", { type: typeLabel })}
        </p>
      </div>
    </Card>
  );
};
