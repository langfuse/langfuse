import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

type ValidationError = {
  datasetItemId: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
};

type DatasetSchemaValidationErrorProps = {
  projectId: string;
  datasetId: string;
  errors: ValidationError[];
};

export const DatasetSchemaValidationError: React.FC<
  DatasetSchemaValidationErrorProps
> = ({ projectId, datasetId, errors }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const errorCount = errors.length;
  const hasMoreThan10 = errorCount === 10; // Backend limits to 10 errors

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertTitle className="text-base font-semibold">
        Schema Validation Failed
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          {hasMoreThan10
            ? `More than 10 items failed validation. Showing first 10 errors.`
            : `${errorCount} item${errorCount === 1 ? "" : "s"} failed validation.`}
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
          <div className="mt-3 space-y-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            {errors.map((error, idx) => (
              <div
                key={`${error.datasetItemId}-${error.field}`}
                className="space-y-1 border-b border-destructive/10 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <Link
                      href={`/project/${projectId}/datasets/${datasetId}/items/${error.datasetItemId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      Item: {error.datasetItemId}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <span className="rounded bg-destructive/20 px-2 py-0.5 text-xs font-medium">
                    {error.field === "input" ? "Input" : "Expected Output"}
                  </span>
                </div>

                <ul className="ml-6 space-y-1 text-sm">
                  {error.errors.map((err, errIdx) => (
                    <li key={errIdx} className="text-destructive">
                      <span className="font-mono text-xs text-muted-foreground">
                        Path {err.path}
                      </span>
                      : {err.message}
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
