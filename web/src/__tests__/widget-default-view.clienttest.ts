import { getDefaultView } from "@/src/features/widgets/utils";

describe("getDefaultView", () => {
  it("should return 'observations' when v4 beta is enabled", () => {
    expect(getDefaultView(true)).toBe("observations");
  });

  it("should return 'traces' when v4 beta is disabled", () => {
    expect(getDefaultView(false)).toBe("traces");
  });
});
