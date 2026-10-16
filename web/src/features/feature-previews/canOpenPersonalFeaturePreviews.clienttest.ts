import { canOpenPersonalFeaturePreviews } from "./canOpenPersonalFeaturePreviews";

describe("canOpenPersonalFeaturePreviews", () => {
  it("opens personal previews on Cloud, the events-backed view, or for a platform admin", () => {
    expect(
      canOpenPersonalFeaturePreviews({
        isLangfuseCloud: true,
        v4BetaEnabled: false,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      canOpenPersonalFeaturePreviews({
        isLangfuseCloud: false,
        v4BetaEnabled: true,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      canOpenPersonalFeaturePreviews({
        isLangfuseCloud: false,
        v4BetaEnabled: false,
        isAdmin: true,
      }),
    ).toBe(true);
  });

  it("hides personal previews when none of those gates apply", () => {
    expect(
      canOpenPersonalFeaturePreviews({
        isLangfuseCloud: false,
        v4BetaEnabled: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });
});
