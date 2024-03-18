export declare const exportFileFormats: readonly ["CSV", "JSON", "OPENAI-JSONL"];
export type ExportFileFormats = (typeof exportFileFormats)[number];
export declare const exportOptions: Record<ExportFileFormats, {
    label: string;
    extension: string;
    fileType: string;
}>;
