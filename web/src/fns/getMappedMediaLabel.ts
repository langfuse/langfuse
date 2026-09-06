const MAPPED_MEDIA_LABELS: Record<string, string> = {
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

export function getMappedMediaLabel(contentType: string): string | undefined {
  return MAPPED_MEDIA_LABELS[contentType.toLowerCase()];
}
