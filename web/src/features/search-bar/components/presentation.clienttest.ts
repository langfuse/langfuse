import { optionDomId } from "./presentation";

describe("optionDomId", () => {
  it("produces a whitespace-free id for values that contain spaces", () => {
    // Value option ids embed the observed value (`value:My Test Trace`); an id
    // with whitespace is invalid HTML and breaks aria-activedescendant.
    const id = optionDomId("search-bar-listbox", "value:My Test Trace");
    expect(/\s/.test(id)).toBe(false);
  });

  it("keeps simple ids stable (percent-encoded, whitespace-free)", () => {
    expect(optionDomId("lb", "field:level")).toBe("lb-opt-field%3Alevel");
  });

  it("maps space-vs-underscore values to DISTINCT ids", () => {
    // `My Test` and `My_Test` are different observed values; a `\s+ → _`
    // collapse aliased them to one duplicate DOM id, breaking aria-
    // activedescendant. encodeURIComponent is injective, so they stay distinct.
    expect(optionDomId("lb", "value:My Test")).not.toBe(
      optionDomId("lb", "value:My_Test"),
    );
    expect(/\s/.test(optionDomId("lb", "value:My Test"))).toBe(false);
  });
});
