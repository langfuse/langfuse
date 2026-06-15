import { deduplicateBy } from "@/src/utils/arrays";

describe("deduplicateBy", () => {
  it("keeps the first item for each key", () => {
    expect(
      deduplicateBy(
        [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
          { id: "a", value: 3 },
        ],
        (item) => item.id,
      ),
    ).toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 },
    ]);
  });
});
