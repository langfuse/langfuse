import { useState } from "react";
import { SquareArrowOutUpRight } from "@langfuse/icons";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Banner } from "@/src/components/design-system/Banner/Banner";
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
    <div className="mt-4">
      <Banner variant="error" title="Schema validation failed">
        <div className="flex flex-col gap-3">
          <p>
            {hasMoreThan10
              ? `More than 10 items failed validation. Showing first 10 errors.`
              : `${errorCount} item${errorCount === 1 ? "" : "s"} failed validation.`}
          </p>

          <ExpandToggle
            variant="icon"
            expanded={isExpanded}
            label="Show error details"
            expandedLabel="Hide error details"
            onExpandedChange={setIsExpanded}
          />

          {isExpanded && (
            <div className="border-destructive/20 bg-destructive/5 mt-3 space-y-3 rounded-md border p-3">
              {errors.map((error, idx) => (
                <div
                  key={`${error.datasetItemId}-${error.field}`}
                  className="border-destructive/10 space-y-1 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">#{idx + 1}</span>
                      <Link
                        href={`/project/${projectId}/datasets/${datasetId}/items/${encodeURIComponent(error.datasetItemId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline"
                      >
                        Item: {error.datasetItemId}
                        <SquareArrowOutUpRight size="sm" />
                      </Link>
                    </div>
                    <span className="bg-destructive/20 rounded px-2 py-0.5 text-xs font-bold">
                      {error.field === "input" ? "Input" : "Expected Output"}
                    </span>
                  </div>

                  <ul className="ml-6 space-y-1">
                    {error.errors.map((err, errIdx) => (
                      <li key={errIdx}>
                        <span className="font-mono text-xs">
                          Path {err.path}
                        </span>
                        : {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {hasMoreThan10 && (
                <p className="pt-2">
                  Fix these errors to see if there are additional validation
                  issues.
                </p>
              )}
            </div>
          )}
        </div>
      </Banner>
    </div>
  );
};
