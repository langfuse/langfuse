// Shadow query validation tests (remove with shadow query code).
// Calls the repository function directly — no HTTP server needed.
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  getObservationsV2FromEventsTableForPublicApi,
  _shadowQueryTestHook,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { randomUUID } from "crypto";

const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

let projectId: string;

const seedObservations = async (
  traceId: string,
  count: number,
  opts?: { withIO?: boolean; withMetadata?: boolean },
) => {
  const base = Date.now() * 1000;
  const events = Array.from({ length: count }, (_, i) => {
    const obsId = randomUUID();
    return createEvent({
      id: obsId,
      span_id: obsId,
      trace_id: traceId,
      project_id: projectId,
      name: `shadow-obs-${i}`,
      type: "GENERATION",
      level: "DEFAULT",
      start_time: base + i * 1000 * 1000,
      ...(opts?.withIO && {
        input: `input-${i}-${"x".repeat(300)}`,
        output: `output-${i}-${"y".repeat(300)}`,
      }),
      ...(opts?.withMetadata && {
        metadata: { env: "test", idx: String(i) },
        metadata_names: ["env", "idx"],
        metadata_values: ["test", String(i)],
      }),
    });
  });
  await createEventsCh(events);
};

maybe("shadow query validation", () => {
  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    projectId = fixture.projectId;
    _shadowQueryTestHook.promise = null;
    _shadowQueryTestHook.forceShadow = false;
  });

  afterEach(() => {
    _shadowQueryTestHook.promise = null;
    _shadowQueryTestHook.forceShadow = false;
  });

  it("reports match for IO queries", async () => {
    const traceId = randomUUID();
    await seedObservations(traceId, 3, { withIO: true });

    _shadowQueryTestHook.forceShadow = true;
    const results = await getObservationsV2FromEventsTableForPublicApi({
      projectId,
      page: 1,
      limit: 50,
      traceId,
      fields: ["core", "basic", "io"],
    });

    expect(results.length).toBe(3);
    expect(_shadowQueryTestHook.promise).not.toBeNull();
    expect(await _shadowQueryTestHook.promise).toBe("match");
  });

  it("reports match with metadata expansion", async () => {
    const traceId = randomUUID();
    await seedObservations(traceId, 2, { withMetadata: true });

    _shadowQueryTestHook.forceShadow = true;
    const results = await getObservationsV2FromEventsTableForPublicApi({
      projectId,
      page: 1,
      limit: 50,
      traceId,
      fields: ["metadata"],
      expandMetadataKeys: ["env", "idx"],
    });

    expect(results.length).toBe(2);
    expect(_shadowQueryTestHook.promise).not.toBeNull();
    expect(await _shadowQueryTestHook.promise).toBe("match");
  });

  it("reports match for empty result sets", async () => {
    _shadowQueryTestHook.forceShadow = true;
    const results = await getObservationsV2FromEventsTableForPublicApi({
      projectId,
      page: 1,
      limit: 50,
      traceId: randomUUID(),
      fields: ["core", "io"],
    });

    expect(results.length).toBe(0);
    expect(_shadowQueryTestHook.promise).not.toBeNull();
    expect(await _shadowQueryTestHook.promise).toBe("match");
  });

  it("does not run for simple queries (no IO/metadata expansion)", async () => {
    const traceId = randomUUID();
    await seedObservations(traceId, 2, {});

    _shadowQueryTestHook.forceShadow = true;
    await getObservationsV2FromEventsTableForPublicApi({
      projectId,
      page: 1,
      limit: 50,
      traceId,
      fields: ["core", "basic"],
    });

    // Simple path (no IO) — shadow never fires even with forceShadow,
    // because queryPath is "simple" not "cte-join".
    expect(_shadowQueryTestHook.promise).toBeNull();
  });

  it("reports match across multiple field group combos", async () => {
    const traceId = randomUUID();
    await seedObservations(traceId, 3, { withIO: true, withMetadata: true });

    const fieldCombos: Array<{
      fields: string[];
      expandMetadataKeys?: string[];
    }> = [
      { fields: ["core", "basic", "io"] },
      { fields: ["core", "basic", "model", "usage", "io", "metadata"] },
      { fields: ["io", "metadata"] },
      { fields: ["metadata"], expandMetadataKeys: ["env", "idx"] },
    ];

    for (const combo of fieldCombos) {
      _shadowQueryTestHook.promise = null;
      _shadowQueryTestHook.forceShadow = true;

      const results = await getObservationsV2FromEventsTableForPublicApi({
        projectId,
        page: 1,
        limit: 50,
        traceId,
        fields: combo.fields as any,
        expandMetadataKeys: combo.expandMetadataKeys,
      });

      expect(results.length).toBe(3);
      expect(_shadowQueryTestHook.promise).not.toBeNull();
      expect(await _shadowQueryTestHook.promise).toBe("match");
    }
  });
});
