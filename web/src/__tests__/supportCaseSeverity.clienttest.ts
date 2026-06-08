// pylonClient imports the shared server logger at module load; stub it so this
// stays a lightweight client-side unit test of the pure mapping function.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { mapToPylonCaseSeverity } from "@/src/features/support-chat/pylon/pylonClient";

describe("mapToPylonCaseSeverity", () => {
  const HIGH_TIER = "cloud:enterprise";
  const LOW_TIER = "cloud:pro";

  it("returns Sev-1 for outages on high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({
        severity: "Outage, data loss, or data breach",
        plan: HIGH_TIER,
      }),
    ).toBe("Sev-1");
  });

  it("honors a manual high-priority request on high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({
        severity: "Question or feature request",
        plan: HIGH_TIER,
        isHighPriority: true,
      }),
    ).toBe("Sev-1");
  });

  it("ignores the high-priority flag for non-high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({
        severity: "Question or feature request",
        plan: LOW_TIER,
        isHighPriority: true,
      }),
    ).toBe("Sev-3");
  });

  it("ignores the high-priority flag when no plan is known", () => {
    expect(
      mapToPylonCaseSeverity({
        severity: "Question or feature request",
        isHighPriority: true,
      }),
    ).toBe("Sev-3");
  });

  it("keeps existing mapping when high-priority is not set", () => {
    expect(
      mapToPylonCaseSeverity({
        severity: "Feature is not working at all",
        plan: HIGH_TIER,
      }),
    ).toBe("Sev-2");
    expect(
      mapToPylonCaseSeverity({
        severity: "Question or feature request",
        plan: HIGH_TIER,
      }),
    ).toBe("Sev-3");
  });
});
