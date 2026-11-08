import { encodeFiltersGeneric } from "@langfuse/shared";

/** Canonical URLs keep saved agent tabs and environment scopes visible. */
export function normalizeAgentUrl(resolvedUrl: string): string | null {
  const url = new URL(resolvedUrl, "http://localhost");
  const hasLegacyTab = url.searchParams.get("tab") === "invocations";
  if (!url.searchParams.has("environment") && !hasLegacyTab) return null;
  if (hasLegacyTab) url.searchParams.set("tab", "runs");
  const environment = url.searchParams.get("environment");
  const filter = url.searchParams.get("filter");
  const hasEnvironmentFilter = filter
    ?.split(",")
    .some((entry) =>
      ["environment", "Environment", "env"].includes(entry.split(";")[0] ?? ""),
    );
  if (filter !== "" && !hasEnvironmentFilter && environment?.trim()) {
    url.searchParams.set(
      "filter",
      [
        filter,
        encodeFiltersGeneric([
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: [environment],
          },
        ]),
      ]
        .filter(Boolean)
        .join(","),
    );
  }
  url.searchParams.delete("environment");
  return url.pathname + url.search;
}
