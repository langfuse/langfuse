import { isNewLegacyEvalAllowed } from "@/src/features/evals/utils/legacyEvalGate";

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
        isLangfuseCloud: false,
        isForceV3Project: false,
      }),
    ).toBe(true);
  });

  it("allows new legacy evals for forced-v3 projects while legacy writes exist", () => {
    for (const v4WriteMode of ["dual", "legacy"] as const) {
      expect(
        isNewLegacyEvalAllowed({
          v4WriteMode,
          isLangfuseCloud: true,
          isForceV3Project: true,
        }),
      ).toBe(true);
    }
  });

  it("blocks forced-v3 projects in events_only mode", () => {
    expect(
      isNewLegacyEvalAllowed({
        v4WriteMode: "events_only",
        isLangfuseCloud: true,
        isForceV3Project: true,
      }),
    ).toBe(false);
  });
});
