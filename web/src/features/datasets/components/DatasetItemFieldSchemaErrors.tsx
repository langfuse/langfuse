import { AlertCircle } from "lucide-react";

type DatasetError = {
  datasetId: string;
  datasetName: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
  }>;
};

type DatasetItemFieldSchemaErrorsProps = {
  errors: DatasetError[];
  showDatasetName?: boolean;
};

export const DatasetItemFieldSchemaErrors: React.FC<
  DatasetItemFieldSchemaErrorsProps
> = ({ errors, showDatasetName = false }) => {
  if (errors.length === 0) return null;

  return (
    <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-destructive">
            Schema validation failed
          </p>
          {errors.map((error, idx) => (
            <div key={`${error.datasetId}-${idx}`} className="space-y-1">
              {showDatasetName && (
                <p className="text-xs font-medium text-muted-foreground">
                  {error.datasetName}
                </p>
              )}
              <ul className="space-y-1 text-sm text-destructive">
                {error.errors.map((err, errIdx) => (
                  <li key={errIdx}>
                    {err.path === "/" ? (
                      <span>{err.message}</span>
                    ) : (
                      <span>
                        <span className="font-mono text-xs">
                          {err.path.replace(/^\//, "")}
                        </span>
                        : {err.message}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
