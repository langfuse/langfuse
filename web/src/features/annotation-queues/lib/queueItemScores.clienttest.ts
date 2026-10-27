import {
  formatQueueItemScore,
  getCategoryBadgeColor,
  pickLatestAnnotationScore,
  resolveQueueItemScore,
  type QueueItemScore,
} from "./queueItemScores";

const score = (overrides: Partial<QueueItemScore>): QueueItemScore => ({
  id: crypto.randomUUID(),
  name: "risk",
  source: "ANNOTATION",
  configId: "config-risk",
  dataType: "CATEGORICAL",
  value: 0,
  stringValue: "high",
  timestamp: new Date("2026-01-01T10:00:00Z"),
  ...overrides,
});

describe("pickLatestAnnotationScore", () => {
  const config = { id: "config-risk", name: "risk" };

  it("returns the latest score matching the config id", () => {
    const older = score({ stringValue: "high" });
    const newer = score({
      stringValue: "low",
      timestamp: new Date("2026-01-01T11:00:00Z"),
    });

    expect(pickLatestAnnotationScore([newer, older], config)).toBe(newer);
    expect(pickLatestAnnotationScore([older, newer], config)).toBe(newer);
  });

  it("prefers a config id match over a newer name-only match", () => {
    const byId = score({ stringValue: "high" });
    const byName = score({
      configId: null,
      stringValue: "low",
      timestamp: new Date("2026-01-02T00:00:00Z"),
    });

    expect(pickLatestAnnotationScore([byName, byId], config)).toBe(byId);
  });

  it("falls back to the config name when no score has the config id", () => {
    const byName = score({ configId: null });
    const otherConfig = score({ configId: "other", name: "other" });

    expect(pickLatestAnnotationScore([otherConfig, byName], config)).toBe(
      byName,
    );
    expect(pickLatestAnnotationScore([otherConfig], config)).toBeUndefined();
  });
});

describe("resolveQueueItemScore", () => {
  const config = { id: "config-risk", name: "risk" };

  it("prefers an annotation over a newer source value", () => {
    const annotation = score({ stringValue: "high" });
    const fromApi = score({
      source: "API",
      stringValue: "low",
      timestamp: new Date("2026-01-02T00:00:00Z"),
    });

    expect(resolveQueueItemScore([fromApi, annotation], config)).toEqual({
      score: annotation,
      pending: false,
    });
  });

  it("falls back to the latest source value, flagged as pending", () => {
    const olderApi = score({ source: "API", stringValue: "high" });
    const newerEval = score({
      source: "EVAL",
      configId: null,
      stringValue: "low",
      timestamp: new Date("2026-01-02T00:00:00Z"),
    });

    expect(resolveQueueItemScore([newerEval, olderApi], config)).toEqual({
      score: olderApi,
      pending: true,
    });
    expect(resolveQueueItemScore([], config)).toBeUndefined();
  });
});

describe("getCategoryBadgeColor", () => {
  const config = {
    categories: [
      { label: "alpha", value: 0 },
      { label: "beta", value: 1 },
      { label: "High", value: 2 },
    ],
  };

  it("colours categories deterministically by their index in the config", () => {
    expect(getCategoryBadgeColor("alpha", config)).toBe(
      getCategoryBadgeColor("alpha", config),
    );
    expect(getCategoryBadgeColor("alpha", config)).not.toBe(
      getCategoryBadgeColor("beta", config),
    );
  });

  it("applies label and prefix overrides case-insensitively", () => {
    expect(getCategoryBadgeColor("High", config)).toBe("red");
    expect(getCategoryBadgeColor("pass", config)).toBe("green");
    expect(getCategoryBadgeColor("not_booked", config)).toBe("red");
    expect(getCategoryBadgeColor("transferred", config)).toBe("blue");
  });

  it("falls back to a neutral badge for labels outside the config", () => {
    expect(getCategoryBadgeColor("unknown", config)).toBe("primary");
  });
});

describe("formatQueueItemScore", () => {
  it("formats each data type for display", () => {
    expect(
      formatQueueItemScore(score({ stringValue: "pass" }), { categories: [] }),
    ).toEqual({ kind: "badge", text: "pass", color: "green" });
    expect(
      formatQueueItemScore(
        score({ dataType: "NUMERIC", value: 3.5, stringValue: null }),
        { categories: [] },
      ),
    ).toEqual({ kind: "number", text: "3.5" });
    expect(
      formatQueueItemScore(
        score({ dataType: "TEXT", stringValue: "caller asked twice" }),
        { categories: [] },
      ),
    ).toEqual({ kind: "text", text: "caller asked twice" });
  });
});
