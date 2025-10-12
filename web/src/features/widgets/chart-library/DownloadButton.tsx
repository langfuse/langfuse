import { Download, Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function DownloadButton({
  data,
  fileName = "chart-data",
  className,
}: {
  data: Record<string, any>[];
  fileName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [isDownloaded, setIsDownloaded] = useState(false);

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
    if (data.length === 0) {
      triggerDownload("");
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
    triggerDownload(csvContent);
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
      aria-label="Download chart data"
      title={t("widget.actions.downloadCsv")}
      disabled={isDownloaded}
    >
      {isDownloaded ? <Check size={16} /> : <Download size={16} />}
    </button>
  );
}
