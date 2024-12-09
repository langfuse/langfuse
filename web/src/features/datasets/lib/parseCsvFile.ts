export const MAX_PREVIEW_ROWS = 10;

export type CsvColumnPreview = {
  name: string;
  samples: string[];
  inferredType: "string" | "number" | "boolean" | "null" | "mixed";
};

export type CsvPreviewResult = {
  fileName: string;
  columns: CsvColumnPreview[];
  totalColumns: number;
  previewRows: number;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let currentValue = "";

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += char;
    }
  }

  result.push(currentValue.trim());
  return result;
}

function inferColumnType(samples: string[]): CsvColumnPreview["inferredType"] {
  const types = new Set(
    samples.map((value) => {
      if (value === "" || value.toLowerCase() === "null") return "null";
      if (value.toLowerCase() === "true" || value.toLowerCase() === "false")
        return "boolean";
      if (!isNaN(Number(value))) return "number";
      return "string";
    }),
  );

  if (types.size === 1) return types.values().next().value;
  if (types.size === 2 && types.has("null")) {
    types.delete("null");
    return types.values().next().value;
  }
  return "mixed";
}

export async function parseCsvPreview(file: File): Promise<CsvPreviewResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = reader.result as string;
        const lines = text.split(/\r?\n/).filter((line) => line.trim());

        if (lines.length === 0) {
          throw new Error("CSV file is empty");
        }

        // Parse header row
        const headerRow = parseCsvLine(lines[0]);
        const columnSamples = new Map<string, string[]>();
        headerRow.forEach((header) => columnSamples.set(header, []));

        // Parse data rows (up to MAX_PREVIEW_ROWS)
        const rowCount = Math.min(lines.length - 1, MAX_PREVIEW_ROWS);
        for (let i = 1; i <= rowCount; i++) {
          const row = parseCsvLine(lines[i]);
          row.forEach((value, colIndex) => {
            const header = headerRow[colIndex];
            const samples = columnSamples.get(header) ?? [];
            samples.push(value);
            columnSamples.set(header, samples);
          });
        }

        // Create column previews
        const columns: CsvColumnPreview[] = headerRow.map((header) => ({
          name: header,
          samples: columnSamples.get(header) ?? [],
          inferredType: inferColumnType(columnSamples.get(header) ?? []),
        }));

        resolve({
          fileName: file.name,
          columns,
          totalColumns: headerRow.length,
          previewRows: rowCount,
        });
      } catch (error) {
        reject(
          new Error(
            `Failed to parse CSV: ${error instanceof Error ? error.message : "Unknown error"}`,
          ),
        );
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    // Read first chunk of the file (64KB should be more than enough for preview)
    const chunk = file.slice(0, 64 * 1024);
    reader.readAsText(chunk);
  });
}
