import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
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

type DatasetItemSchemaErrorsProps = {
  errors: DatasetError[];
};

export const DatasetItemSchemaErrors: React.FC<
  DatasetItemSchemaErrorsProps
> = ({ errors }) => {
  if (errors.length === 0) return null;

  // Group errors by dataset
  const errorsByDataset = errors.reduce(
    (acc, error) => {
      const key = error.datasetId;
      if (!acc[key]) {
        acc[key] = {
          datasetName: error.datasetName,
          errors: [],
        };
      }
      acc[key].errors.push(error);
      return acc;
    },
    {} as Record<string, { datasetName: string; errors: DatasetError[] }>,
  );

  return (
    <Alert variant="destructive" className="mt-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle className="text-base font-semibold">
        Schema Validation Failed
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-4">
        <p className="text-sm">
          The data does not match the required schema for this dataset.
        </p>
        {Object.entries(errorsByDataset).map(([datasetId, datasetErrors]) => (
          <div key={datasetId} className="space-y-3">
            {Object.keys(errorsByDataset).length > 1 && (
              <div className="text-sm font-semibold">
                {datasetErrors.datasetName}
              </div>
            )}
            {datasetErrors.errors.map((error, idx) => (
              <div key={idx} className="space-y-2">
                <div className="text-sm font-semibold">
                  {error.field === "input" ? "Input" : "Expected Output"}
                </div>
                <ul className="ml-4 space-y-1.5 text-sm">
                  {error.errors.map((err, errIdx) => (
                    <li key={errIdx} className="list-disc">
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
        ))}
      </AlertDescription>
    </Alert>
  );
};
