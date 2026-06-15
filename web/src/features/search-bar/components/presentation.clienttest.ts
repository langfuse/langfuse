import { optionDomId } from "./presentation";

describe("optionDomId", () => {
  it("produces a whitespace-free id for values that contain spaces", () => {
    // Value option ids embed the observed value (`value:My Test Trace`); an id
    // with whitespace is invalid HTML and breaks aria-activedescendant.
    const id = optionDomId("search-bar-listbox", "value:My Test Trace");
    expect(/\s/.test(id)).toBe(false);
  });

  it("keeps simple ids stable", () => {
    expect(optionDomId("lb", "field:level")).toBe("lb-opt-field:level");
  });
});
