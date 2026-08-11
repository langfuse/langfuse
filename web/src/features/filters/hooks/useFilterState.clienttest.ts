import type { FilterState } from "@langfuse/shared";
import { getCommaArrayParam } from "./useFilterState";

const param = getCommaArrayParam("traces");

const roundTrip = (filters: FilterState) =>
  param.decode(param.encode(filters) ?? null);

/**
 * Traces ingested without a name are stored as an empty string, so `[""]` is a
 * legitimate stringOptions selection meaning "no trace name". The legacy query
 * encoder used by the dashboard page must preserve it, matching the behaviour
 * of decodeFiltersGeneric used by the newer sidebar filters.
 */
describe("useFilterState legacy query encoding (langfuse#1198)", () => {
  it("preserves an empty-string stringOptions filter through a URL round-trip", () => {
    const filters: FilterState = [
      {
        column: "Name",
        type: "stringOptions",
        operator: "any of",
        value: [""],
      },
    ];

    expect(roundTrip(filters)).toEqual(filters);
  });

  it("preserves an empty string alongside real values", () => {
    const filters: FilterState = [
      {
        column: "Name",
        type: "stringOptions",
        operator: "any of",
        value: ["", "chat-completion"],
      },
    ];

    expect(roundTrip(filters)).toEqual(filters);
  });

  it("still round-trips ordinary stringOptions filters", () => {
    const filters: FilterState = [
      {
        column: "Name",
        type: "stringOptions",
        operator: "any of",
        value: ["chat-completion", "summarize"],
      },
    ];

    expect(roundTrip(filters)).toEqual(filters);
  });

  // Only stringOptions may treat a blank segment as [""]: it is the one options
  // type whose schema rejects [], so a blank segment there is unambiguous. The
  // types below permit [], so a blank segment means "nothing selected" and must
  // not silently become a filter for the empty string. Column ids must be real
  // ids for the table under test, otherwise the filter is dropped during column
  // resolution and the assertion would pass without exercising this logic.
  it.each([
    ["arrayOptions", param, "traceTags;arrayOptions;;all of;"],
    [
      "categoryOptions",
      getCommaArrayParam("dataset_runs"),
      "agg_score_categories;categoryOptions;quality;any of;",
    ],
  ] as const)(
    "does not turn an empty %s selection into an empty-string value",
    (_type, codec, encoded) => {
      const decoded = codec.decode(encoded);

      expect(
        decoded?.some((f) => JSON.stringify(f.value) === '[""]'),
      ).toBeFalsy();
    },
  );

  it("still drops a blank string filter instead of applying an empty match", () => {
    // `contains ""` would match nothing while the input looks blank. "userId"
    // is a real `string` column on traces, so this reaches the value logic.
    expect(param.decode("userId;string;;contains;")).toEqual([]);
  });
});
