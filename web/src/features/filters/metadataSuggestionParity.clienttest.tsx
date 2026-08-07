/**
 * The sidebar half of the unified metadata suggestions (LFE-11030): the
 * Metadata facet reads the same observed-key/value map the search bar does,
 * offered from the option map's `metadata` and `metadata.<key>` entries.
 *
 * The invariant worth pinning is that these stay SUGGESTIONS: the observed map
 * only covers rows already loaded, so a key or value it has never seen must
 * still be typeable.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { KeyValueFilterBuilder } from "@/src/components/table/key-value-filter-builder";
import { observedMetadataOptions } from "@/src/fns/observedMetadata/metadataPaths";
import {
  useSidebarFilterState,
  type StringKeyValueUIFilter,
} from "./hooks/useSidebarFilterState";
import type { FilterConfig } from "./lib/filter-config";

// The hook calls useQueryParam unconditionally even for the "memory" state
// location used here; stub it out so no QueryParamProvider is needed.
vi.mock("use-query-params", async () => {
  const actual = await vi.importActual("use-query-params");
  return {
    ...actual,
    StringParam: {},
    useQueryParam: () => [null, () => {}] as const,
  };
});

const METADATA_FILTER_CONFIG: FilterConfig = {
  tableName: "observations",
  columnDefinitions: [
    {
      id: "metadata",
      name: "Metadata",
      type: "stringObject",
      internal: 'o."metadata"',
    },
  ],
  facets: [{ type: "stringKeyValue", column: "metadata", label: "Metadata" }],
};

function MetadataFacetHarness() {
  const queryFilter = useSidebarFilterState(
    METADATA_FILTER_CONFIG,
    observedMetadataOptions({
      region: { type: "string", values: ["eu", "us"] },
      retries: { type: "number" },
      scope: { type: "object" },
    }),
    { stateLocation: "memory" },
  );

  const facet = queryFilter.filters.find(
    (f): f is StringKeyValueUIFilter => f.column === "metadata",
  );
  if (!facet) throw new Error("metadata facet missing");

  return (
    <KeyValueFilterBuilder
      mode="string"
      keyOptions={facet.keyOptions}
      keyDetails={facet.keyDetails}
      valueOptions={facet.valueOptions}
      activeFilters={facet.value}
      onChange={facet.onChange}
    />
  );
}

describe("metadata suggestions in the filter sidebar", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("offers observed keys with their type hint, then the key's values", () => {
    render(<MetadataFacetHarness />);
    fireEvent.click(screen.getByText("Add filter"));

    const key = screen.getByPlaceholderText("Key");
    fireEvent.focus(key);
    // Sorted by the projection, each with its observed JSON type as the hint.
    expect(screen.getByText("region")).toBeInTheDocument();
    expect(screen.getByText("number")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("region"));
    expect(key).toHaveValue("region");

    const value = screen.getByPlaceholderText("Value");
    fireEvent.focus(value);
    fireEvent.mouseDown(screen.getByText("eu"));
    expect(value).toHaveValue("eu");
  });

  it("ranks matches prefix-first, the way the search bar does", () => {
    render(
      <KeyValueFilterBuilder
        mode="string"
        keyOptions={["user.region", "region", "regional"]}
        activeFilters={[]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Add filter"));
    const key = screen.getByPlaceholderText("Key");
    fireEvent.focus(key);
    fireEvent.change(key, { target: { value: "regio" } });

    expect(
      screen
        .getAllByRole("option")
        .map((option) => option.textContent?.trim() ?? ""),
    ).toEqual(["region", "regional", "user.region"]);
  });

  it("never offers what is already typed, and picks with the keyboard", () => {
    render(<MetadataFacetHarness />);
    fireEvent.click(screen.getByText("Add filter"));

    const key = screen.getByPlaceholderText("Key");
    fireEvent.focus(key);
    // Typing commits the row, so the draft key returns as an "observed" key —
    // it must not become a suggestion for the input it came from.
    fireEvent.change(key, { target: { value: "sc" } });
    expect(
      screen.getAllByRole("option").map((o) => o.textContent?.trim() ?? ""),
    ).not.toContain("sc");

    fireEvent.keyDown(key, { key: "ArrowDown" });
    fireEvent.keyDown(key, { key: "Enter" });
    expect(key).toHaveValue("scope");

    // Blur clears the highlight: coming back to the field must not let Enter
    // accept a suggestion the user never picked in this visit.
    fireEvent.change(key, { target: { value: "re" } });
    fireEvent.keyDown(key, { key: "ArrowDown" });
    fireEvent.blur(key);
    fireEvent.focus(key);
    fireEvent.keyDown(key, { key: "Enter" });
    expect(key).toHaveValue("re");
  });

  it("still accepts a key and value the observed map has never seen", () => {
    render(<MetadataFacetHarness />);
    fireEvent.click(screen.getByText("Add filter"));

    const key = screen.getByPlaceholderText("Key");
    fireEvent.change(key, { target: { value: "never-observed" } });
    const value = screen.getByPlaceholderText("Value");
    fireEvent.change(value, { target: { value: "also-new" } });

    expect(key).toHaveValue("never-observed");
    expect(value).toHaveValue("also-new");
  });
});
