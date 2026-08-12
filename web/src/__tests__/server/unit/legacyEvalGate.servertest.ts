import { isNewLegacyEvalAllowed } from "@/src/features/evals/server/legacyEvalGate";

describe("isNewLegacyEvalAllowed", () => {
  it("blocks new legacy evals in events_only mode", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "events_only",
        isLangfuseCloud: false,
        isForceV3Project: false,
      }),
    ).toBe(false);
  });

  it("blocks new legacy evals on Cloud in dual mode", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "dual",
        isLangfuseCloud: true,
        isForceV3Project: false,
      }),
    ).toBe(false);
  });

  it("allows new legacy evals on self-hosted dual and legacy modes", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "dual",
        isLangfuseCloud: false,
        isForceV3Project: false,
      }),
    ).toBe(true);
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "legacy",
        isLangfuseCloud: true,
        isForceV3Project: false,
      }),
    ).toBe(true);
  });

  it("always allows new legacy evals for forced-v3 projects", () => {
    for (const v4WriteMode of ["events_only", "dual", "legacy"] as const) {
      expect(
        isNewLegacyEvalAllowed({
          v4WriteMode,
          isLangfuseCloud: true,
          isForceV3Project: true,
        }),
      ).toBe(true);
    }
  });
});
