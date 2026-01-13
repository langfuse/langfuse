import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { type BulkDatasetItemValidationError } from "@langfuse/shared";

type CsvImportValidationErrorProps = {
  errors: BulkDatasetItemValidationError[];
};

export const CsvImportValidationError: React.FC<
  CsvImportValidationErrorProps
> = ({ errors }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const errorCount = errors.length;
  const hasMoreThan10 = errorCount >= 10; // Backend might limit errors

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertTitle className="text-base font-semibold">
        Schema Validation Failed
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          {hasMoreThan10
            ? `${errorCount}+ items failed validation. Showing first ${errorCount} errors.`
            : `${errorCount} item${errorCount === 1 ? "" : "s"} failed validation.`}
        </p>
        <p className="text-sm text-muted-foreground">
          The CSV data does not match the required schema for this dataset. Fix
          the errors in your CSV file and try importing again.
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-auto p-0 text-sm font-medium hover:bg-transparent"
        >
          {isExpanded ? (
            <ChevronDown className="mr-1 h-4 w-4" />
          ) : (
            <ChevronRight className="mr-1 h-4 w-4" />
          )}
          {isExpanded ? "Hide" : "Show"} error details
        </Button>

        {isExpanded && (
          <div className="mt-3 max-h-[400px] space-y-3 overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5 p-3">
            {errors.map((error, idx) => (
              <div
                key={`${error.itemIndex}-${error.field}`}
                className="space-y-1 border-b border-destructive/10 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{idx + 1}
                  </span>
                  <span className="text-sm font-medium">
                    CSV Row {error.itemIndex + 2}:{" "}
                    {error.field === "input" ? "Input" : "Expected Output"}
                  </span>
                </div>

                <ul className="ml-6 space-y-1 text-sm">
                  {error.errors.map((err, errIdx) => (
                    <li key={errIdx} className="text-destructive">
                      {err.path !== "/" && (
                        <span className="font-mono text-xs text-muted-foreground">
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
              <p className="pt-2 text-xs text-muted-foreground">
                Fix these errors to see if there are additional validation
                issues.
              </p>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
