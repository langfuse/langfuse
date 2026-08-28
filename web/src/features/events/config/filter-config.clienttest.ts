import {
  eventsTableCols,
  getCachedInputMetric,
  observationsTableCols,
  tracesTableCols,
} from "@langfuse/shared";
import { normalizeFilterColumnNames } from "@/src/features/filters/lib/filter-transform";
import { observationFilterConfig } from "@/src/features/filters/config/observations-config";
import { traceFilterConfig } from "@/src/features/filters/config/traces-config";
import {
  getEventsColumnName,
  observationEventsFilterConfig,
} from "@/src/features/events/config/filter-config";

describe("observation status display name", () => {
  it("uses Status for both the table column and the sidebar filter", () => {
    expect(getEventsColumnName("level")).toBe("Status");
    expect(
      observationEventsFilterConfig.facets.find(
        (facet) => facet.column === "level",
      )?.label,
    ).toBe("Status");
    expect(
      observationsTableCols.find((column) => column.id === "level")?.name,
    ).toBe("Status");
    expect(
      observationFilterConfig.facets.find((facet) => facet.column === "level")
        ?.label,
    ).toBe("Status");
    expect(tracesTableCols.find((column) => column.id === "level")?.name).toBe(
      "Status",
    );
    expect(
      traceFilterConfig.facets.find((facet) => facet.column === "level")?.label,
    ).toBe("Status");
  });

  it("still resolves saved filters that address the column as Level", () => {
    for (const columns of [
      eventsTableCols,
      observationsTableCols,
      tracesTableCols,
    ]) {
      const [normalized] = normalizeFilterColumnNames(
        [
          {
            column: "Level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
        ],
        columns,
      );

      expect(normalized?.column).toBe("level");
    }
  });
});

describe("cached input metrics", () => {
  it.each([
    ["input_cached_tokens", 80],
    ["input_cache_read", 81],
    ["cache_read_input_tokens", 82],
    ["cached_content_token_count", 83],
  ])("reads the %s cache-read bucket", (key, value) => {
    expect(getCachedInputMetric({ [key]: value })).toBe(value);
  });

  it("prefers a total bucket over cached modality sub-buckets", () => {
    expect(
      getCachedInputMetric({
        input_cached_tokens: 80,
        input_cached_text_tokens: 60,
        input_cached_audio_tokens: 20,
      }),
    ).toBe(80);
  });

  it("sums cached modality sub-buckets when no total bucket exists", () => {
    expect(
      getCachedInputMetric({
        input_cached_text_tokens: 60,
        input_cached_audio_tokens: 20,
      }),
    ).toBe(80);
  });

  it("returns zero when no cached-read bucket exists", () => {
    expect(getCachedInputMetric()).toBe(0);
    expect(getCachedInputMetric({ input_cache_creation: 100 })).toBe(0);
  });

  it("exposes cached token and cost columns as numeric sidebar facets", () => {
    expect(getEventsColumnName("cachedInputTokens")).toBe(
      "Cached Input Tokens",
    );
    expect(getEventsColumnName("cachedInputCost")).toBe(
      "Cached Input Cost ($)",
    );

    for (const column of ["cachedInputTokens", "cachedInputCost"]) {
      expect(
        observationEventsFilterConfig.facets.find(
          (facet) => facet.column === column,
        ),
      ).toMatchObject({ type: "numeric" });
    }
  });
});
