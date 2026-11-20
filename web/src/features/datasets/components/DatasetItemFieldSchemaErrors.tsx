import { Banner } from "@/src/components/design-system/Banner/Banner";

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
  return (
    <Banner variant="error" title="Schema validation failed">
      <div className="space-y-2">
        {errors.map((error, idx) => (
          <div key={`${error.datasetId}-${idx}`} className="space-y-1">
            {showDatasetName && (
              <p className="font-bold">{error.datasetName}</p>
            )}
            <ul className="space-y-1">
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
    </Banner>
  );
};
