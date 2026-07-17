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

const ENTERPRISE = "cloud:enterprise"; // may raise Sev-1, Sev-2, Sev-3
const SELF_HOSTED_ENTERPRISE = "self-hosted:enterprise"; // same as ENTERPRISE
const TEAM = "cloud:team"; // may raise Sev-3 only
const PRO = "cloud:pro"; // may raise Sev-3 only
const LOW_TIER = "cloud:hobby"; // no case severity at all
const CORE = "cloud:core"; // no case severity at all

describe("mapToPylonCaseSeverity", () => {
  it("maps Severity 1 to Sev-1 only on Enterprise plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: ENTERPRISE }),
    ).toBe("Sev-1");
    expect(
      mapToPylonCaseSeverity({
        severity: SEVERITY_1,
        plan: SELF_HOSTED_ENTERPRISE,
      }),
    ).toBe("Sev-1");
  });

  it("downgrades Severity 1 to Sev-3 for non-Enterprise paid plans", () => {
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: TEAM })).toBe(
      "Sev-3",
    );
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1, plan: PRO })).toBe(
      "Sev-3",
    );
  });

  it("downgrades Severity 1 to Sev-3 when no plan is known", () => {
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_1 })).toBe("Sev-3");
  });

  it("maps Severity 2 to Sev-2 only on Enterprise plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: ENTERPRISE }),
    ).toBe("Sev-2");
    expect(
      mapToPylonCaseSeverity({
        severity: SEVERITY_2,
        plan: SELF_HOSTED_ENTERPRISE,
      }),
    ).toBe("Sev-2");
  });

  it("downgrades Severity 2 to Sev-3 for non-Enterprise paid plans", () => {
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: TEAM })).toBe(
      "Sev-3",
    );
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_2, plan: PRO })).toBe(
      "Sev-3",
    );
  });

  it("maps Severity 3 to Sev-3 for eligible plans and unknown plans", () => {
    expect(
      mapToPylonCaseSeverity({ severity: SEVERITY_3, plan: ENTERPRISE }),
    ).toBe("Sev-3");
    expect(mapToPylonCaseSeverity({ severity: SEVERITY_3 })).toBe("Sev-3");
  });

  it("returns no case severity for Hobby/Core plans regardless of selection", () => {
    for (const severity of [SEVERITY_1, SEVERITY_2, SEVERITY_3]) {
      expect(
        mapToPylonCaseSeverity({ severity, plan: LOW_TIER }),
      ).toBeUndefined();
      expect(mapToPylonCaseSeverity({ severity, plan: CORE })).toBeUndefined();
    }
  });
});

describe("isSeverityAllowedForPlan", () => {
  it("allows Severity 1 only for Enterprise plans", () => {
    expect(isSeverityAllowedForPlan(SEVERITY_1, ENTERPRISE)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_1, SELF_HOSTED_ENTERPRISE)).toBe(
      true,
    );
    expect(isSeverityAllowedForPlan(SEVERITY_1, TEAM)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_1, PRO)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_1, LOW_TIER)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_1, undefined)).toBe(false);
  });

  it("allows Severity 2 only for Enterprise plans", () => {
    expect(isSeverityAllowedForPlan(SEVERITY_2, ENTERPRISE)).toBe(true);
    expect(isSeverityAllowedForPlan(SEVERITY_2, SELF_HOSTED_ENTERPRISE)).toBe(
      true,
    );
    expect(isSeverityAllowedForPlan(SEVERITY_2, TEAM)).toBe(false);
    expect(isSeverityAllowedForPlan(SEVERITY_2, PRO)).toBe(false);
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

  it("falls back to low priority when there is no case severity", () => {
    expect(mapCaseSeverityToPylonPriority(undefined)).toBe("low");
  });
});
