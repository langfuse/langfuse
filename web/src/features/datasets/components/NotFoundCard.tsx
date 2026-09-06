import { Card } from "@/src/components/ui/card";
import { useTranslations } from "next-intl";

export const NotFoundCard = ({
  itemType,
  singleLine = false,
}: {
  itemType: "trace" | "observation";
  singleLine?: boolean;
}) => {
  const t = useTranslations("coreDetails.datasets.notFound");
  const localizedType = itemType === "trace" ? t("trace") : t("observation");
  const description = t("description", { type: localizedType });

  if (singleLine) {
    return (
      <Card className="flex h-full w-full items-center justify-start overflow-hidden rounded-sm px-2">
        <p
          className="text-muted-foreground truncate text-xs"
          title={description}
        >
          {description}
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm p-3">
      <h2 className="mb-1.5 text-sm font-bold">{t("title")}</h2>
      <p className="text-muted-foreground max-w-xs text-center text-xs">
        {description}
      </p>
    </Card>
  );
};
