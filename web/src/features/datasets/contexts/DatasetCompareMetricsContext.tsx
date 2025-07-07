import { createContext, useContext, useState, type ReactNode } from "react";

const DATASET_RUN_METRICS = ["scores", "resourceMetrics"] as const;
export type DatasetRunMetric = (typeof DATASET_RUN_METRICS)[number];

interface DatasetCompareMetricsContextValue {
  selectedMetrics: DatasetRunMetric[];
  setSelectedMetrics: (metrics: DatasetRunMetric[]) => void;
  toggleMetric: (metric: DatasetRunMetric) => void;
  isMetricSelected: (metric: DatasetRunMetric) => boolean;
}

const DatasetCompareMetricsContext = createContext<
  DatasetCompareMetricsContextValue | undefined
>(undefined);

interface DatasetCompareMetricsProviderProps {
  children: ReactNode;
  defaultMetrics?: DatasetRunMetric[];
}

export function DatasetCompareMetricsProvider({
  children,
  defaultMetrics = ["scores", "resourceMetrics"],
}: DatasetCompareMetricsProviderProps) {
  const [selectedMetrics, setSelectedMetrics] =
    useState<DatasetRunMetric[]>(defaultMetrics);

  const toggleMetric = (metric: DatasetRunMetric) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric],
    );
  };

  const isMetricSelected = (metric: DatasetRunMetric) => {
    return selectedMetrics.includes(metric);
  };

  return (
    <DatasetCompareMetricsContext.Provider
      value={{
        selectedMetrics,
        setSelectedMetrics,
        toggleMetric,
        isMetricSelected,
      }}
    >
      {children}
    </DatasetCompareMetricsContext.Provider>
  );
}

export function useDatasetCompareMetrics() {
  const context = useContext(DatasetCompareMetricsContext);
  if (context === undefined) {
    throw new Error(
      "useDatasetCompareMetrics must be used within a DatasetCompareMetricsProvider",
    );
  }
  return context;
}
