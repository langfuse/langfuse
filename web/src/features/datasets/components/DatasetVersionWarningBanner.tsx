/* eslint-disable @repo/no-style-props */
import { Info } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useFormatter, useTranslations } from "next-intl";

type DatasetVersionWarningBannerProps = {
  selectedVersion: Date;
  resetToLatest: () => void;
  className?: string;
  changeCounts?: {
    upserts: number;
    deletes: number;
  };
};

export function DatasetVersionWarningBanner({
  selectedVersion,
  resetToLatest,
  className = "",
  changeCounts,
}: DatasetVersionWarningBannerProps) {
  const t = useTranslations("coreDetails.datasets.versionBanner");
  const format = useFormatter();
  const totalChanges = changeCounts
    ? changeCounts.upserts + changeCounts.deletes
    : 0;
  const hasChanges = totalChanges > 0;

  return (
    <div
      className={`border-accent-dark-blue/10 bg-accent-light-blue/30 flex items-start gap-3 border-b p-3 ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm wrap-break-word">
            {t("viewing", {
              date: format.dateTime(selectedVersion, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "numeric",
              }),
            })}
          </p>
          <Button
            onClick={resetToLatest}
            variant="link"
            className="h-auto shrink-0 p-0 text-sm underline-offset-4"
          >
            {t("latest")}
          </Button>
        </div>
        {changeCounts && hasChanges && (
          <p className="text-muted-foreground text-xs">
            {t("changes", { count: totalChanges })}:{" "}
            {[
              changeCounts.upserts > 0
                ? t("upserts", { count: changeCounts.upserts })
                : null,
              changeCounts.deletes > 0
                ? t("deletes", { count: changeCounts.deletes })
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
