import { describe, expect, it } from "vitest";

import { resolveSelectedConnectionId } from "./resolveSelectedConnectionId";

describe("resolveSelectedConnectionId", () => {
  it("falls back to the first credential when the requested one is not in the organization", () => {
    expect(
      resolveSelectedConnectionId({
        requestedId: "from-another-org",
        loadedIds: ["first", "second"],
        hasMore: false,
      }),
    ).toBe("first");
  });

  it("keeps an unloaded ID while more pages exist", () => {
    expect(
      resolveSelectedConnectionId({
        requestedId: "on-page-two",
        loadedIds: ["first"],
        hasMore: true,
      }),
    ).toBe("on-page-two");
  });
});
