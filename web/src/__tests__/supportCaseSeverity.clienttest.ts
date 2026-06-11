// pylonClient imports the shared server logger at module load; stub it so this
// stays a lightweight client-side unit test of the pure mapping functions.
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  mapToPylonCaseSeverity,
  mapCaseSeverityToPylonPriority,
} from "@/src/features/support-chat/pylon/pylonClient";
import {
  SEVERITY_1,
  SEVERITY_2,
  SEVERITY_3,
} from "@/src/features/support-chat/formConstants";

describe("mapToPylonCaseSeverity", () => {
  const HIGH_TIER = "cloud:enterprise";
  const LOW_TIER = "cloud:pro";

  it("maps Severity 1 to Sev-1 on high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: HIGH_TIER }),
    ).toBe("Sev-1");
  });

  it("downgrades Severity 1 to Sev-2 for non-high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: LOW_TIER }),
    ).toBe("Sev-2");
  });

  it("downgrades Severity 1 to Sev-2 when no plan is known", () => {
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1 })).toBe("Sev-2");
  });

  it("maps Severity 2 to Sev-2 regardless of plan", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: HIGH_TIER }),
    ).toBe("Sev-2");
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: LOW_TIER }),
    ).toBe("Sev-2");
  });

  it("maps Severity 3 to Sev-3 regardless of plan", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_3, plan: HIGH_TIER }),
    ).toBe("Sev-3");
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_3 })).toBe("Sev-3");
  });
});

describe("mapCaseSeverityToPylonPriority", () => {
  it("derives Pylon priority from the effective case severity", () => {
    expect(mapCaseSeverityToPylonPriority("Sev-1")).toBe("urgent");
    expect(mapCaseSeverityToPylonPriority("Sev-2")).toBe("high");
    expect(mapCaseSeverityToPylonPriority("Sev-3")).toBe("low");
  });
});
