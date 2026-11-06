import { encodeFiltersGeneric } from "@langfuse/shared";

/** Canonical filter URLs prevent a cleared filter from reviving a legacy scope. */
export function normalizeAgentEnvironmentUrl(
  resolvedUrl: string,
): string | null {
  const url = new URL(resolvedUrl, "http://localhost");
  if (!url.searchParams.has("environment")) return null;
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
