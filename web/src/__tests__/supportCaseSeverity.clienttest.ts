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
  isSeverityAllowedForPlan,
} from "@/src/features/support-chat/formConstants";

const HIGH_TIER = "cloud:enterprise"; // may raise Sev-1, Sev-2, Sev-3
const MID_TIER = "cloud:pro"; // may raise Sev-2, Sev-3
const LOW_TIER = "cloud:hobby"; // may raise Sev-3 only
const CORE = "cloud:core"; // may raise Sev-3 only

describe("mapToPylonCaseSeverity", () => {
  it("maps Severity 1 to Sev-1 only on high-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: HIGH_TIER }),
    ).toBe("Sev-1");
  });

  it("downgrades Severity 1 to Sev-2 for Pro-tier plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: MID_TIER }),
    ).toBe("Sev-2");
  });

  it("downgrades Severity 1 to Sev-3 for Hobby/Core plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: LOW_TIER }),
    ).toBe("Sev-3");
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: CORE })).toBe(
      "Sev-3",
    );
  });

  it("downgrades Severity 1 to Sev-3 when no plan is known", () => {
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1 })).toBe("Sev-3");
  });

  it("maps Severity 2 to Sev-2 for Pro tier and above", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: HIGH_TIER }),
    ).toBe("Sev-2");
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: MID_TIER }),
    ).toBe("Sev-2");
  });

  it("downgrades Severity 2 to Sev-3 for Hobby/Core plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: LOW_TIER }),
    ).toBe("Sev-3");
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: CORE })).toBe(
      "Sev-3",
    );
  });

  it("maps Severity 3 to Sev-3 regardless of plan", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_3, plan: HIGH_TIER }),
    ).toBe("Sev-3");
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_3 })).toBe("Sev-3");
  });
});

describe("isSeverityAllowedForPlan", () => {
  it("allows Severity 1 only for high-tier plans", () => {
    expect(isSeverityAllowedForPlan(SEVERITY_1, HIGH_TIER)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_1, MID_TIER)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_1, LOW_TIER)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_1, undefined)).toBe(false);
  });

  it("allows Severity 2 for Pro tier and above but not Hobby/Core", () => {
    expect(isSeverityAllowedForPlan(SEVERITY_2, HIGH_TIER)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_2, MID_TIER)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_2, LOW_TIER)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_2, CORE)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_2, undefined)).toBe(false);
  });

  it("always allows Severity 3", () => {
    expect(isSeverityAllowedForPlan(SEVERITY_3, LOW_TIER)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_3, undefined)).toBe(true);
  });
});

describe("mapCaseSeverityToPylonPriority", () => {
  it("derives Pylon priority from the effective case severity", () => {
    expect(mapCaseSeverityToPylonPriority("Sev-1")).toBe("urgent");
    expect(mapCaseSeverityToPylonPriority("Sev-2")).toBe("high");
    expect(mapCaseSeverityToPylonPriority("Sev-3")).toBe("low");
  });
});
