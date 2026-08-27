import {
  createDatasetRunScore,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { env } from "@/src/env.mjs";
import { GetExperimentsV1Response } from "@/src/features/public-api/types/experiments";

const getExperiments = (url: string, auth: string) =>
  makeZodVerifiedAPICall(GetExperimentsV1Response, "GET", url, undefined, auth);

const maybeEventTables =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;
const maybeLegacyMode =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN !== "true" ? it : it.skip;

const createExperimentRootEvent = ({
  projectId,
  experimentId,
  experimentName = experimentId,
  datasetId = "dataset-1",
  startTimeMs,
  metadata = {},
  experimentItemId = randomUUID(),
}: {
  projectId: string;
  experimentId: string;
  experimentName?: string;
  datasetId?: string | null;
  startTimeMs: number;
  metadata?: Record<string, string>;
  experimentItemId?: string;
}) => {
  const spanId = randomUUID();

  return createEvent({
    id: spanId,
    span_id: spanId,
    trace_id: randomUUID(),
    project_id: projectId,
    name: `${experimentName}-root`,
    type: "SPAN",
    start_time: startTimeMs * 1000,
    end_time: (startTimeMs + 100) * 1000,
    experiment_id: experimentId,
    experiment_name: experimentName,
    experiment_description: `${experimentName} description`,
    experiment_dataset_id: datasetId,
    experiment_item_id: experimentItemId,
    experiment_item_root_span_id: spanId,
    experiment_metadata_names: Object.keys(metadata),
    experiment_metadata_values: Object.values(metadata),
  });
};

describe("GET /api/public/experiments", () => {
  maybeLegacyMode("is unavailable when v4 preview is disabled", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());

    const res = await makeAPICall(
      "GET",
      `/api/public/experiments?fromStartTime=${fromStartTime}`,
      undefined,
      auth,
    );

    expect(res.status).toBe(404);
  });

  it("requires fromStartTime", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const res = await makeAPICall(
      "GET",
      "/api/public/experiments",
      undefined,
      auth,
    );

    expect(res.status).toBe(400);
  });

  it("rejects unknown field groups", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());

    const res = await makeAPICall(
      "GET",
      `/api/public/experiments?fromStartTime=${fromStartTime}&fields=id`,
      undefined,
      auth,
    );

    expect(res.status).toBe(400);
  });

  maybeEventTables(
    "lists experiment summaries with core fields by default",
    async () => {
      const { auth, projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "core experiment",
          datasetId: "dataset-core",
          startTimeMs,
          metadata: { region: "eu" },
        }),
      ]);

      const fromStartTime = new Date(startTimeMs - 1_000).toISOString();
      const res = await getExperiments(
        `/api/public/experiments?fromStartTime=${encodeURIComponent(fromStartTime)}`,
        auth,
      );

      expect(res.status).toBe(200);
      const experiment = res.body.data.find((item) => item.id === experimentId);
      expect(experiment).toMatchObject({
        id: experimentId,
        name: "core experiment",
        description: "core experiment description",
        startTime: new Date(startTimeMs).toISOString(),
        endTime: new Date(startTimeMs + 100).toISOString(),
        itemCount: 1,
        datasetId: "dataset-core",
      });
      expect(experiment).not.toHaveProperty("metadata");
      expect(experiment).not.toHaveProperty("scores");
    },
  );

  maybeEventTables(
    "lists experiment summaries without a dataset id",
    async () => {
      const { auth, projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "datasetless experiment",
          datasetId: null,
          startTimeMs,
        }),
      ]);

      const fromStartTime = new Date(startTimeMs - 1_000).toISOString();
      const res = await getExperiments(
        `/api/public/experiments?fromStartTime=${encodeURIComponent(fromStartTime)}`,
        auth,
      );

      expect(res.status).toBe(200);
      const experiment = res.body.data.find((item) => item.id === experimentId);
      expect(experiment).toMatchObject({
        id: experimentId,
        datasetId: null,
      });
    },
  );

  maybeEventTables(
    "returns experiment-scoped scores when requested",
    async () => {
      const { auth, projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now() - 60_000;
      const experimentId = `exp-${randomUUID()}`;
      const scoreId = `score-${randomUUID()}`;
      const traceScopedScoreId = `score-${randomUUID()}`;
      const otherExperimentScoreId = `score-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "scored experiment",
          startTimeMs,
        }),
      ]);
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: experimentId,
          name: "experiment quality",
          value: 0.75,
          timestamp: startTimeMs + 1_000,
          created_at: startTimeMs + 1_000,
          updated_at: startTimeMs + 1_000,
          event_ts: startTimeMs + 1_000,
        }),
        {
          ...createDatasetRunScore({
            id: traceScopedScoreId,
            project_id: projectId,
            dataset_run_id: experimentId,
          }),
          trace_id: randomUUID(),
        },
        createDatasetRunScore({
          id: otherExperimentScoreId,
          project_id: projectId,
          dataset_run_id: `exp-${randomUUID()}`,
        }),
      ]);

      const fromStartTime = new Date(startTimeMs - 1_000).toISOString();
      const res = await getExperiments(
        `/api/public/experiments?fromStartTime=${encodeURIComponent(fromStartTime)}&fields=scores`,
        auth,
      );

      expect(res.status).toBe(200);
      const experiment = res.body.data.find((item) => item.id === experimentId);
      expect(experiment?.scores).toEqual([
        expect.objectContaining({
          id: scoreId,
          projectId,
          name: "experiment quality",
          dataType: "NUMERIC",
          value: 0.75,
          subject: {
            kind: "experiment",
            id: experimentId,
          },
        }),
      ]);
      expect(experiment?.scores?.map((score) => score.id)).not.toContain(
        traceScopedScoreId,
      );
      expect(experiment?.scores?.map((score) => score.id)).not.toContain(
        otherExperimentScoreId,
      );
    },
  );

  it("rejects structured filters outside the experiment filter allowlist", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());
    const filter = encodeURIComponent(
      JSON.stringify([
        {
          type: "stringOptions",
          column: "startTime",
          operator: "any of",
          value: ["2026-06-25T00:00:00.000Z"],
        },
      ]),
    );

    const res = await makeAPICall(
      "GET",
      `/api/public/experiments?fromStartTime=${fromStartTime}&filter=${filter}`,
      undefined,
      auth,
    );

    expect(res.status).toBe(400);
  });

  it("rejects invalid cursors and unknown cursor versions", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());

    const invalidCursorRes = await makeAPICall(
      "GET",
      `/api/public/experiments?fromStartTime=${fromStartTime}&cursor=not-json`,
      undefined,
      auth,
    );
    expect(invalidCursorRes.status).toBe(400);

    const unknownVersionCursor = Buffer.from(
      JSON.stringify({
        v: 3,
        lastTime: new Date().toISOString(),
        lastExperimentId: `exp-${randomUUID()}`,
      }),
    ).toString("base64url");

    const unknownVersionRes = await makeAPICall(
      "GET",
      `/api/public/experiments?fromStartTime=${fromStartTime}&cursor=${unknownVersionCursor}`,
      undefined,
      auth,
    );
    expect(unknownVersionRes.status).toBe(400);
  });
});

describe("GET /api/public/experiment-items", () => {
  maybeLegacyMode("is unavailable when v4 preview is disabled", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());

    const res = await makeAPICall(
      "GET",
      `/api/public/experiment-items?fromStartTime=${fromStartTime}`,
      undefined,
      auth,
    );

    expect(res.status).toBe(404);
  });

  it("requires fromStartTime", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const res = await makeAPICall(
      "GET",
      "/api/public/experiment-items",
      undefined,
      auth,
    );

    expect(res.status).toBe(400);
  });

  it("rejects unknown field groups", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const fromStartTime = encodeURIComponent(new Date().toISOString());

    const res = await makeAPICall(
      "GET",
      `/api/public/experiment-items?fromStartTime=${fromStartTime}&fields=experimentScores`,
      undefined,
      auth,
    );

    expect(res.status).toBe(400);
  });
});
