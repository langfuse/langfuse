import { Download, Check } from "lucide-react";
import { useState } from "react";
import { formatMetricName } from "@/src/features/widgets/utils";
import {
  sortPivotTableRows,
  transformChartDataToPivotTable,
  type PivotTableConfig,
} from "@/src/features/widgets/utils/pivot-table-utils";
import { type OrderByState } from "@langfuse/shared";

const escapeCsvValue = (value: unknown): string => {
  const stringValue = String(value ?? "");
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export function createChartCsvContent({
  data,
  pivotTableConfig,
  sortState,
}: {
  data: Record<string, unknown>[];
  pivotTableConfig?: PivotTableConfig;
  sortState?: OrderByState | null;
}): string {
  if (data.length === 0) {
    return "";
  }

  if (pivotTableConfig) {
    const pivotRows = transformChartDataToPivotTable(
      data as Parameters<typeof transformChartDataToPivotTable>[0],
      pivotTableConfig,
    );
    const sortedRows =
      sortState?.column && sortState.order
        ? sortPivotTableRows(pivotRows, sortState)
        : pivotRows;
    const dimensionHeader =
      pivotTableConfig.dimensions.length > 0
        ? pivotTableConfig.dimensions.map(formatMetricName).join(" / ")
        : "Dimension";
    const headers = [
      dimensionHeader,
      ...pivotTableConfig.metrics.map(formatMetricName),
    ];

    return [
      headers.map(escapeCsvValue).join(","),
      ...sortedRows.map((row) =>
        [
          row.label,
          ...pivotTableConfig.metrics.map((metric) => row.values[metric]),
        ]
          .map(escapeCsvValue)
          .join(","),
      ),
    ].join("\n");
  }

  const headers = Object.keys(data[0] ?? {});
  const csvRows = [
    headers.map(escapeCsvValue).join(","),
    ...data.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(",")),
  ];

  return csvRows.join("\n");
}

export function DownloadButton({
  data,
  fileName = "chart-data",
  className,
  pivotTableConfig,
  sortState,
}: {
  data: Record<string, unknown>[];
  fileName?: string;
  className?: string;
  pivotTableConfig?: PivotTableConfig;
  sortState?: OrderByState | null;
}) {
  const [isDownloaded, setIsDownloaded] = useState(false);

  const triggerDownload = (csvContent: string) => {
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // Show checkmark for 1 second
    setIsDownloaded(true);
    setTimeout(() => {
      setIsDownloaded(false);
    }, 1000);
  };

  const downloadCsv = () => {
    triggerDownload(
      createChartCsvContent({ data, pivotTableConfig, sortState }),
    );
  };

  return (
    <button
      onClick={() => {
        if (isDownloaded) {
          return;
        }
        downloadCsv();
      }}
      className={`text-muted-foreground hover:text-foreground ${className || ""}`}
      aria-label="Download chart data as CSV"
      title="Download CSV"
      disabled={isDownloaded}
    >
      {isDownloaded ? <Check size={16} /> : <Download size={16} />}
    </button>
  );
}
