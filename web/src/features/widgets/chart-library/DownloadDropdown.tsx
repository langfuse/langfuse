import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Download } from "lucide-react";

export function DownloadDropdown({
  data,
  fileName = "chart-data",
}: {
  data: Record<string, any>[];
  fileName?: string;
}) {
  const download = (content: string, type: string, extension: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    download(JSON.stringify(data, null, 2), "application/json", "json");
  };

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
      download("", "text/csv", "csv");
      return;
    }
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => escapeCsvValue(row[h])).join(","),
      ),
    ];
    download(csvRows.join("\n"), "text/csv", "csv");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100"
        >
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={downloadCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onSelect={downloadJson}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
