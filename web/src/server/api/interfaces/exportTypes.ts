export const exportFileFormats = ["CSV", "JSON", "OPENAI-JSONL"] as const;
export type ExportFileFormats = (typeof exportFileFormats)[number];

export const exportOptions: Record<
  ExportFileFormats,
  {
    label: string;
    extension: string;
    fileType: string;
  }
> = {
  CSV: { label: "CSV", extension: "csv", fileType: "text/csv" },
  JSON: { label: "JSON", extension: "json", fileType: "application/json" },
  "OPENAI-JSONL": {
    label: "OpenAI JSONL (fine-tuning)",
    extension: "jsonl",
    fileType: "application/json",
  },
} as const;
