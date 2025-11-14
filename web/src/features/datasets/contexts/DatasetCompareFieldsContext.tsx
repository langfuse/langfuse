import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryParams, withDefault, BooleanParam } from "use-query-params";

const DATASET_RUN_FIELDS = ["output", "scores", "resourceMetrics"] as const;
export type DatasetRunField = (typeof DATASET_RUN_FIELDS)[number];

interface DatasetCompareFieldsContextValue {
  selectedFields: DatasetRunField[];
  setSelectedFields: (fields: DatasetRunField[]) => void;
  toggleField: (field: DatasetRunField) => void;
  isFieldSelected: (field: DatasetRunField) => boolean;
  showDiffMode: boolean;
  setShowDiffMode: (show: boolean) => void;
}

const DatasetCompareFieldsContext = createContext<
  DatasetCompareFieldsContextValue | undefined
>(undefined);

interface DatasetCompareFieldsProviderProps {
  children: ReactNode;
  defaultFields?: DatasetRunField[];
}

export function DatasetCompareFieldsProvider({
  children,
  defaultFields = ["output", "scores", "resourceMetrics"],
}: DatasetCompareFieldsProviderProps) {
  const [selectedFields, setSelectedFields] =
    useState<DatasetRunField[]>(defaultFields);

  const [{ showDiff }, setQueryParams] = useQueryParams({
    showDiff: withDefault(BooleanParam, false),
  });

  const setShowDiffMode = (show: boolean) => {
    setQueryParams({ showDiff: show });
  };

  const toggleField = (field: DatasetRunField) => {
    setSelectedFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  const isFieldSelected = (field: DatasetRunField) => {
    return selectedFields.includes(field);
  };

  return (
    <DatasetCompareFieldsContext.Provider
      value={{
        selectedFields,
        setSelectedFields,
        toggleField,
        isFieldSelected,
        showDiffMode: showDiff ?? false,
        setShowDiffMode,
      }}
    >
      {children}
    </DatasetCompareFieldsContext.Provider>
  );
}

export function useDatasetCompareFields() {
  const context = useContext(DatasetCompareFieldsContext);
  if (context === undefined) {
    throw new Error(
      "useDatasetCompareFields must be used within a DatasetCompareFieldsProvider",
    );
  }
  return context;
}
