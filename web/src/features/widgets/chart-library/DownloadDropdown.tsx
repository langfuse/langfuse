import { Download } from "lucide-react";

export function DownloadDropdown({
  data,
  fileName = "chart-data",
  className,
}: {
  data: Record<string, any>[];
  fileName?: string;
  className?: string;
}) {
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

  const downloadCsv = () => {
    if (data.length === 0) {
      const blob = new Blob([""], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => escapeCsvValue(row[h])).join(","),
      ),
    ];

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={downloadCsv}
      className={`text-muted-foreground hover:text-foreground ${className || ""}`}
      aria-label="Download chart data as CSV"
      title="Download CSV"
    >
      <Download size={16} />
    </button>
  );
}
