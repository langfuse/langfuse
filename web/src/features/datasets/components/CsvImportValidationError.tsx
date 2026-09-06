import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { type BulkDatasetItemValidationError } from "@langfuse/shared";
import { useTranslations } from "next-intl";

type CsvImportValidationErrorProps = {
  errors: BulkDatasetItemValidationError[];
};

export const CsvImportValidationError: React.FC<
  CsvImportValidationErrorProps
> = ({ errors }) => {
  const t = useTranslations("coreDetails.datasets.validation");
  const [isExpanded, setIsExpanded] = useState(false);

  const errorCount = errors.length;
  const hasMoreThan10 = errorCount >= 10; // Backend might limit errors

  return (
    <div className="mt-4">
      <Alert variant="destructive">
        <Alert.Title>{t("failed")}</Alert.Title>
        <Alert.Description>
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-sm">
              {hasMoreThan10
                ? t("manyCsvFailures", { count: errorCount })
                : t("failureCount", { count: errorCount })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("csvDescription")}
            </p>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-auto p-0 text-sm font-bold hover:bg-transparent"
            >
              {isExpanded ? (
                <ChevronDown className="mr-1 h-4 w-4" />
              ) : (
                <ChevronRight className="mr-1 h-4 w-4" />
              )}
              {isExpanded ? t("hideDetails") : t("showDetails")}
            </Button>

            {isExpanded && (
              <div className="border-destructive/20 bg-destructive/5 mt-3 max-h-[400px] space-y-3 overflow-y-auto rounded-md border p-3">
                {errors.map((error, idx) => (
                  <div
                    key={`${error.itemIndex}-${error.field}`}
                    className="border-destructive/10 space-y-1 border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">
                        #{idx + 1}
                      </span>
                      <span className="text-sm font-bold">
                        {t("csvRow", { row: error.itemIndex + 2 })}:{" "}
                        {error.field === "input"
                          ? t("input")
                          : error.field === "metadata"
                            ? t("metadata")
                            : t("expectedOutput")}
                      </span>
                    </div>

                    <ul className="ml-6 space-y-1 text-sm">
                      {error.errors.map((err, errIdx) => (
                        <li key={errIdx} className="text-destructive">
                          {err.path !== "/" && (
                            <span className="text-muted-foreground font-mono text-xs">
                              {err.path}:{" "}
                            </span>
                          )}
                          {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {hasMoreThan10 && (
                  <p className="text-muted-foreground pt-2 text-xs">
                    {t("fixMore")}
                  </p>
                )}
              </div>
            )}
          </div>
        </Alert.Description>
      </Alert>
    </div>
  );
};
