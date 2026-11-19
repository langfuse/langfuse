import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

describe("isNewLegacyEvalAllowed", () => {
  it("blocks new legacy evals in events_only mode", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "events_only",
        isLangfuseCloud: false,
      }),
    ).toBe(false);
  });

  it("blocks new legacy evals on Cloud in dual mode", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "dual",
        isLangfuseCloud: true,
      }),
    ).toBe(false);
  });

  it("allows new legacy evals on self-hosted dual and legacy modes", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "dual",
        isLangfuseCloud: false,
      }),
    ).toBe(true);
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "legacy",
        isLangfuseCloud: false,
      }),
    ).toBe(true);
  });
});
