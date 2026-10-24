import { renderHook } from "@testing-library/react";
import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { applyCheckboxSelection } from "../lib/sidebar-filter-actions";
import { useQueryFilterState } from "./useFilterState";

const url = vi.hoisted(() => ({ filter: "" }));
vi.mock("use-query-params", async () => ({
  ...(await vi.importActual("use-query-params")),
  useQueryParam: (
    _name: string,
    codec: { decode: (value: string) => FilterState | undefined },
  ) => [codec.decode(url.filter), vi.fn()],
}));

describe("legacy prompt filter decoding", () => {
  it.each([
    ["type", "Type", "stringOptions", "chat"],
    ["type", "Type", "stringOptions", ""],
    ["labels", "Labels", "arrayOptions", "production"],
    ["tags", "Tags", "arrayOptions", ""],
  ] as const)(
    "preserves a sidebar empty selection for %s (%s, %s, %s)",
    (column, name, type, value) => {
      const filters = applyCheckboxSelection(
        {
          facets: [{ column, label: name, type: "categorical" }],
          columnDefinitions: [
            { id: column, name, type, options: [], internal: column },
          ],
          options: { [column]: [value] },
        },
        [{ column, type, operator: "any of", value: [value] }],
        column,
        [],
      );
      url.filter = encodeFiltersGeneric(filters);
      const { result } = renderHook(() =>
        useQueryFilterState([], "prompts", "project"),
      );
      expect(result.current[0]).toEqual(
        filters.map((filter) => ({ ...filter, column: name })),
      );
    },
  );
});
