const escapeCsvValue = (value: any): string => {
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

/**
 * Downloads a widget's chart DATA rows as CSV. Not to be confused with the
 * widget's configuration export (`downloadWidgetJson`).
 */
export function downloadChartDataCsv(
  data: Record<string, any>[],
  fileName = "chart-data",
) {
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const csvContent =
    data.length === 0
      ? ""
      : [
          headers.join(","),
          ...data.map((row) =>
            headers.map((h) => escapeCsvValue(row[h])).join(","),
          ),
        ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
