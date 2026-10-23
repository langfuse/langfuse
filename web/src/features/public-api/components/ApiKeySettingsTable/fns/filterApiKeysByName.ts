import type { ApiKeySettingsTableRow } from "@/src/features/public-api/components/ApiKeySettingsTable/ApiKeySettingsTable";

export function filterApiKeysByName(
  apiKeys: ApiKeySettingsTableRow[],
  searchQuery: string,
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  if (normalizedSearch.length === 0) return apiKeys;
  return apiKeys.filter((apiKey) =>
    apiKey.note?.toLowerCase().includes(normalizedSearch),
  );
}
