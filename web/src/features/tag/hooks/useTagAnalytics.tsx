import { usePostHog } from "posthog-js/react";

export function useTagAnalytics() {
  const posthog = usePostHog();
  // Todo decide where we get the table name property from
  // This hook might need to be refactored depending of the final implementation
  const tableName = "Tag Analytics";

  // Determine the 'type' based on the 4th URL segment. If it exists, set 'type' to "Detail View", otherwise set it to "table".
  const type = "detail view" ?? "table";

  return { posthog, tableName, type };
}
