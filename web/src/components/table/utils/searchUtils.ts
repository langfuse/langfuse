import type { TracingSearchType } from "@langfuse/shared";

// Helper function to get the current search mode value for the radio group
export function getSearchMode(
  searchType: TracingSearchType[] | undefined,
): string {
  if (!searchType) return "metadata";
  if (searchType.includes("content")) return "metadata_fulltext";
  if (searchType.includes("input")) return "metadata_fulltext_input";
  if (searchType.includes("output")) return "metadata_fulltext_output";
  return "metadata";
}

// Helper function to get the button label based on current search type
export function getSearchButtonLabel(
  searchType: TracingSearchType[] | undefined,
  metadataLabel?: string,
): string {
  if (!searchType) return metadataLabel ?? "IDs / Names";
  if (searchType.includes("content")) return "Full Text: Content";
  if (searchType.includes("input")) return "Full Text: Input";
  if (searchType.includes("output")) return "Full Text: Output";
  return metadataLabel ?? "IDs / Names";
}

// Helper function to convert search mode value to search type array
export function searchModeToType(mode: string): TracingSearchType[] {
  switch (mode) {
    case "metadata_fulltext":
      return ["id", "content"];
    case "metadata_fulltext_input":
      return ["id", "input"];
    case "metadata_fulltext_output":
      return ["id", "output"];
    default:
      return ["id"];
  }
}
