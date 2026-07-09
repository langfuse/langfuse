import { render, screen } from "@testing-library/react";
import { Accordion } from "@/src/components/ui/accordion";
import { CategoricalFacet } from "./data-table-controls";

describe("CategoricalFacet", () => {
  it("shows selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.queryByText("No options found")).not.toBeInTheDocument();
  });

  it("shows Clear for active selected values even when the backend returns no options", () => {
    render(
      <Accordion type="multiple" value={["type"]}>
        <CategoricalFacet
          label="Type"
          filterKey="type"
          expanded
          loading={false}
          options={[]}
          counts={new Map()}
          value={["AGENT"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    expect(screen.getByLabelText("Clear Type filter")).toBeInTheDocument();
  });

  it("pins a selected option to the top of a long list so it is visible without 'Show more'", () => {
    // 20 options, one selected near the bottom. Without pinning the selected
    // value sits below the 12-item cap and is hidden behind "Show more".
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={["opt-18"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    // The list is long enough to be capped...
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();

    // ...yet the selected value is shown despite sitting at position 19,
    // and it precedes the first unselected option in DOM order (pinned to top).
    const selected = screen.getByText("opt-18");
    const firstUnselected = screen.getByText("opt-0");
    expect(selected).toBeInTheDocument();
    expect(
      selected.compareDocumentPosition(firstUnselected) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the 'Show more' cap when every option is reported selected (no-filter default)", () => {
    // useSidebarFilterState returns value === options when no filter is applied
    // (computeSelectedValues). That all-selected default must NOT be treated as
    // a pinned selection — doing so would render the entire list with no cap.
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={options}
          onChange={() => {}}
          isActive={false}
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    // The cap is preserved: "Show more" still renders and a deep value stays hidden.
    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("opt-19")).not.toBeInTheDocument();
  });

  it("never bypasses the cap, even for a large selection", () => {
    // A large selection (e.g. a "none of" include-set) must still respect the
    // visible-count cap rather than dumping every value into the DOM.
    const options = Array.from({ length: 20 }, (_, i) => `opt-${i}`);
    const selected = options.slice(0, 18); // 18 of 20 selected
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={options}
          counts={new Map()}
          value={selected}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    expect(
      screen.getByRole("button", { name: "Show more values" }),
    ).toBeInTheDocument();
    // Only the capped number of rows render, not all 18 selected.
    expect(screen.getAllByRole("checkbox").length).toBeLessThanOrEqual(12);
  });

  it("does not reorder short, fully-visible lists", () => {
    render(
      <Accordion type="multiple" value={["c"]}>
        <CategoricalFacet
          label="C"
          filterKey="c"
          expanded
          loading={false}
          options={["a", "b", "c"]}
          counts={new Map()}
          value={["c"]}
          onChange={() => {}}
          isActive
          isDisabled={false}
          onReset={() => {}}
        />
      </Accordion>,
    );

    // No cap, no "Show more": the natural order is preserved (a, b, c) — the
    // selected "c" is NOT pulled above "a".
    const a = screen.getByText("a");
    const c = screen.getByText("c");
    expect(
      a.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
