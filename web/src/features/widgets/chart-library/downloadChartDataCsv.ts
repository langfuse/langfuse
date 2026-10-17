const escapeCsvValue = (value: any): string => {
  const stringValue = String(value ?? "");
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

/**
 * Serializes chart data rows to CSV text. Both the header row and the value
 * rows are escaped, so dynamic column names (e.g. breakdown dimension values)
 * that contain a comma, quote, or line break do not misalign the columns.
 */
export function buildChartDataCsv(data: Record<string, any>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  return [
    headers.map(escapeCsvValue).join(","),
    ...data.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(",")),
  ].join("\n");
}

/**
 * Downloads a widget's chart DATA rows as CSV. Not to be confused with the
 * widget's configuration export (`downloadWidgetJson`).
 */
export function downloadChartDataCsv(
  data: Record<string, any>[],
  fileName = "chart-data",
) {
  const csvContent = buildChartDataCsv(data);

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
