import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetObservationsV1Response,
  GetObservationV1Response,
} from "@/src/features/public-api/types/observations";
import {
  DATASET_RUN_ITEMS_DEPRECATION,
  OBSERVATIONS_V1_DEPRECATION,
  SCORES_DEPRECATION,
  SESSIONS_DEPRECATION,
  TRACES_DEPRECATION,
} from "@/src/features/public-api/server/deprecations";
import { OBSERVATIONS_API_V2_DOCS_URL } from "@/src/features/public-api/server/rateLimitUpgradePaths";
import { randomUUID } from "crypto";

// LFE-10895: legacy (v3-data-model) endpoints attach a top-level `_deprecation`
// object so coding agents get a self-correcting migration signal.
describe("public API deprecation signal", () => {
  let auth: string;
  let projectId: string;

  beforeAll(async () => {
    const fixture = await createOrgProjectAndApiKey();
    auth = fixture.auth;
    projectId = fixture.projectId;
  });

  it("attaches `_deprecation` to the legacy GET /observations list response", async () => {
    const response = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect(response.body._deprecation).toEqual(OBSERVATIONS_V1_DEPRECATION);
    expect(response.body._deprecation?.replacement).toBe(
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    );
  });

  it("carries the docs URL", async () => {
    const response = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations",
      undefined,
      auth,
    );

    // docsUrl points at the migration guidance for the endpoint family.
    expect(response.body._deprecation?.docsUrl).toBe(
      OBSERVATIONS_API_V2_DOCS_URL,
    );
  });

  // Single-item response: `_deprecation` is added via `.extend()` at the
  // response level (not on the shared item schema). makeZodVerifiedAPICall
  // validates the strict single-item schema accepts the injected field.
  it("attaches `_deprecation` to the legacy single GET /observations/{id}", async () => {
    const observationId = randomUUID();
    await createObservationsCh([
      createObservation({
        id: observationId,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
      }),
    ]);

    const response = await makeZodVerifiedAPICall(
      GetObservationV1Response,
      "GET",
      `/api/public/observations/${observationId}`,
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect(response.body._deprecation).toEqual(OBSERVATIONS_V1_DEPRECATION);
  });

  // Scores v2 uses a non-strict response schema, so this also proves the
  // injection works without a schema edit on the response type.
  it("attaches `_deprecation` to the legacy GET /v2/scores list response", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/v2/scores",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect((response.body as Record<string, unknown>)._deprecation).toEqual(
      SCORES_DEPRECATION,
    );
  });

  // Traces is being removed; it points at observations v2 as a soft
  // replacement for reading span/trace data in v4.
  it("attaches `_deprecation` with the observations-v2 soft replacement to legacy GET /traces", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/traces",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    const deprecation = (response.body as Record<string, unknown>)._deprecation;
    // toEqual against the constant covers `replacement` (incl. query params).
    expect(deprecation).toEqual(TRACES_DEPRECATION);
  });

  // Sessions is deprecated and not replaced, so `_deprecation` is message-only.
  it("attaches a replacement-less `_deprecation` to legacy GET /sessions", async () => {
    const response = await makeAPICall(
      "GET",
      "/api/public/sessions",
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    const deprecation = (response.body as Record<string, unknown>)._deprecation;
    expect(deprecation).toEqual(SESSIONS_DEPRECATION);
    expect((deprecation as Record<string, unknown>)?.replacement).toBe(
      "GET /api/public/v2/observations?filter=<urlencoded sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
    );
  });

  // Dataset run items (Group C) → experiment items. Needs a real dataset + run
  // (the endpoint 404s otherwise); an empty run returns an empty list + signal.
  it("attaches `_deprecation` to the legacy GET /dataset-run-items list response", async () => {
    const dataset = await prisma.dataset.create({
      data: { name: `deprecation-test-${randomUUID()}`, projectId },
    });
    const run = await prisma.datasetRuns.create({
      data: { name: `run-${randomUUID()}`, datasetId: dataset.id, projectId },
    });

    const response = await makeAPICall(
      "GET",
      `/api/public/dataset-run-items?datasetId=${dataset.id}&runName=${run.name}`,
      undefined,
      auth,
    );

    expect(response.status).toBe(200);
    expect((response.body as Record<string, unknown>)._deprecation).toEqual(
      DATASET_RUN_ITEMS_DEPRECATION,
    );
  });
});
