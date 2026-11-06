// Deterministic project data, anchored at `now`. Shapes follow the legacy
// trace list and the v2 observations rows (see README for sources).

const DAY = 24 * 60 * 60 * 1000;

export const PROJECT = {
  id: "eval-project",
  name: "agent-eval",
  organization: { id: "eval-org", name: "Agent eval" },
  metadata: {},
};

const cost = (i, k) => Math.round(((i * 137 + k * 59) % 500) + 10) / 100000;

/**
 * buildFixture returns traces and observations. Traces in the 7-day window are
 * the expected CSV rows; a few older traces sit outside the window, and the
 * kinds cover the edge cases agents tend to miss:
 * - "empty": an ingestion-API trace with no observations (v2 returns one `t-<id>` row, cost 0)
 * - "otel": no trace name; the legacy endpoint reports the root span's name
 * - "regular": a named trace with a root span and two costed generations
 */
export function buildFixture({ now = new Date(), inWindow = 120, outOfWindow = 5 } = {}) {
  const nowMs = now.getTime();
  const traces = [];
  const observations = [];
  const total = inWindow + outOfWindow;
  for (let i = 0; i < total; i++) {
    const inside = i < inWindow;
    const startMs = inside
      ? nowMs - 60 * 60 * 1000 - Math.floor((i / inWindow) * (7 * DAY - 2 * 60 * 60 * 1000))
      : nowMs - 8 * DAY - i * 60 * 60 * 1000;
    const id = `trace-${String(i).padStart(4, "0")}`;
    const kind = i % 10 === 0 ? "empty" : i % 10 === 1 ? "otel" : "regular";
    const ts = new Date(startMs);
    const obs = [];
    if (kind === "empty") {
      obs.push(observation({ id: `t-${id}`, traceId: id, type: "SPAN", name: `job-${i}`, start: startMs, end: startMs, traceName: `job-${i}`, totalCost: 0 }));
    } else {
      const rootId = `${id}-root`;
      const traceName = kind === "otel" ? null : `chat-${i}`;
      const rootName = kind === "otel" ? `otel-root-${i}` : `chat-${i}`;
      obs.push(observation({ id: rootId, traceId: id, type: "SPAN", name: rootName, start: startMs, end: startMs + 4000, traceName, totalCost: 0 }));
      for (let k = 1; k <= 2; k++) {
        obs.push(
          observation({
            id: `${id}-gen-${k}`,
            traceId: id,
            parentObservationId: rootId,
            type: "GENERATION",
            name: `llm-call-${k}`,
            start: startMs + k * 1000,
            end: startMs + k * 1000 + 800,
            // Child observations of OTel traces carry no trace name.
            traceName: kind === "otel" ? null : traceName,
            totalCost: cost(i, k),
            model: "gpt-4o-mini",
          }),
        );
      }
    }
    const totalCost = obs.reduce((sum, o) => sum + o.totalCost, 0);
    const name = kind === "otel" ? `otel-root-${i}` : kind === "empty" ? `job-${i}` : `chat-${i}`;
    traces.push({
      id,
      timestamp: ts.toISOString(),
      name,
      kind,
      inWindow: inside,
      totalCost: Math.round(totalCost * 1e8) / 1e8,
      latency: kind === "empty" ? 0 : 4,
      observationIds: obs.filter((o) => !o.id.startsWith("t-")).map((o) => o.id),
    });
    observations.push(...obs);
  }
  return { now, traces, observations };
}

function observation({ id, traceId, parentObservationId = null, type, name, start, end, traceName, totalCost, model = null }) {
  return {
    id,
    traceId,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    projectId: PROJECT.id,
    parentObservationId,
    type,
    name,
    level: "DEFAULT",
    statusMessage: null,
    version: null,
    environment: "default",
    bookmarked: false,
    public: false,
    userId: null,
    sessionId: null,
    isRootObservation: parentObservationId === null,
    completionStartTime: null,
    createdAt: new Date(start).toISOString(),
    updatedAt: new Date(end).toISOString(),
    input: null,
    output: null,
    metadata: {},
    model,
    internalModelId: null,
    modelParameters: {},
    usageDetails: model ? { input: 100, output: 50, total: 150 } : {},
    costDetails: model ? { total: totalCost } : {},
    totalCost,
    usagePricingTierName: null,
    promptId: null,
    promptName: null,
    promptVersion: null,
    latency: (end - start) / 1000,
    timeToFirstToken: null,
    tags: [],
    release: null,
    traceName,
  };
}

/** expectedRows is the CSV an exact export of the last 7 days produces. */
export function expectedRows(fixture) {
  return fixture.traces
    .filter((t) => t.inWindow)
    .map((t) => ({ id: t.id, name: t.name, timestamp: t.timestamp, total_cost: t.totalCost }));
}
