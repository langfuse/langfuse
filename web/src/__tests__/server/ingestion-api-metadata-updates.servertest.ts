import {
  randomUUID,
  makeAPICall,
  waitForExpect,
  getBlobStorageByProjectAndEntityId,
  getObservationById,
  getScoreById,
  getTraceById,
  createOrgProjectAndApiKey,
  v4,
} from "./ingestion-api.fixtures";

let projectId: string;
let auth: string;

const postIngestion = (body: unknown) =>
  makeAPICall("POST", "/api/public/ingestion", body, auth);

describe("/api/public/ingestion API Endpoint", () => {
  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    projectId = fixture.projectId;
    auth = fixture.auth;
  });

  it("should create a log entry for the S3 file", async () => {
    const traceId = v4();
    const eventId = v4();

    const response = await postIngestion({
      batch: [
        {
          id: eventId,
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "Foo Bar",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
      ],
    });
    expect(response.status).toBe(207);

    await waitForExpect(async () => {
      const logs = await getBlobStorageByProjectAndEntityId(
        projectId,
        "trace",
        traceId,
      );
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].bucket_path).toBe(
        `events/${projectId}/trace/${traceId}/${eventId}.json`,
      );
    });
  });

  it.each([
    ["string", { testId: "this is a string metadata" }],
    ["big-number", { testId: "1983516295378495150" }],
    ["small-number", { testId: 5 }],
    ["float-number", { testId: 5.5 }],
  ])(
    "#6123: should treat %s metadata for traces as such",
    async (_type, metadataValue) => {
      const traceId = randomUUID();

      const entity = {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          timestamp: new Date().toISOString(),
          metadata: metadataValue,
        },
      };

      const response = await postIngestion({
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const trace = await getTraceById({ traceId, projectId });
        expect(trace).toBeDefined();
        expect(trace!.id).toBe(traceId);
        expect(JSON.stringify(trace!.metadata)).toBe(
          JSON.stringify(metadataValue),
        );
      });
    },
    10000,
  );

  it.each([
    ["string", { testId: "this is a string metadata" }],
    ["big-number", { testId: "1983516295378495150" }],
    ["small-number", { testId: 5 }],
    ["float-number", { testId: 5.5 }],
  ])(
    "#6123: should treat %s metadata for observations as such",
    async (_type, metadataValue) => {
      const observationId = randomUUID();
      const traceId = randomUUID();

      const entity = {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: observationId,
          traceId: traceId,
          startTime: new Date().toISOString(),
          metadata: metadataValue,
        },
      };

      const response = await postIngestion({
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const observation = await getObservationById({
          id: observationId,
          projectId,
          fetchWithInputOutput: true,
        });
        expect(observation).toBeDefined();
        expect(observation!.id).toBe(observationId);
        expect(JSON.stringify(observation!.metadata)).toBe(
          JSON.stringify(metadataValue),
        );
      });
    },
  );

  it.each([
    ["string", { testId: "this is a string metadata" }],
    ["big-number", { testId: "1983516295378495150" }],
    ["small-number", { testId: 5 }],
    ["float-number", { testId: 5.5 }],
  ])(
    "#6123: should treat %s metadata for scores as such",
    async (_type, metadataValue) => {
      const scoreId = randomUUID();
      const traceId = randomUUID();

      const entity = {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: scoreId,
          name: "score-name",
          traceId: traceId,
          value: 100.5,
          metadata: metadataValue,
        },
      };

      const response = await postIngestion({
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const score = await getScoreById({ projectId, scoreId });
        expect(score).toBeDefined();
        expect(score!.id).toBe(scoreId);
        expect(JSON.stringify(score!.metadata)).toBe(
          JSON.stringify(metadataValue),
        );
      });
    },
  );

  it("should merge metadata correctly across multiple trace updates", async () => {
    const traceId = randomUUID();

    // First update with initial metadata: {"step": 1, "status": "started"}
    const traceUpdate1 = {
      id: randomUUID(),
      type: "trace-create",
      timestamp: new Date().toISOString(),
      body: {
        id: traceId,
        name: "operation",
        timestamp: new Date().toISOString(),
        metadata: { step: 1, status: "started" },
      },
    };

    // Second update with additional metadata: {"step": 2, "error": ""}
    // This should merge with the first update
    const traceUpdate2 = {
      id: randomUUID(),
      type: "trace-create",
      timestamp: new Date(Date.now() + 1000).toISOString(), // Later timestamp
      body: {
        id: traceId,
        name: "operation",
        timestamp: new Date(Date.now() + 1000).toISOString(),
        metadata: { step: 2, error: "" },
      },
    };

    const response1 = await postIngestion({
      batch: [traceUpdate1],
    });
    expect(response1.status).toBe(207);

    await waitForExpect(async () => {
      const trace = await getTraceById({ traceId, projectId });
      expect(trace?.metadata).toEqual({
        step: 1,
        status: "started",
      });
    }, 15_000);

    const response2 = await postIngestion({
      batch: [traceUpdate2],
    });
    expect(response2.status).toBe(207);

    await waitForExpect(async () => {
      const trace = await getTraceById({ traceId, projectId });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(traceId);
      expect(trace!.projectId).toBe(projectId);

      // Expected final metadata: {"step": 2, "status": "started", "error": ""}
      // This verifies that:
      // - "step" is updated to the latest value (2)
      // - "status" is preserved from the first update ("started")
      // - "error" is added from the second update ("")
      expect(trace!.metadata).toEqual({
        step: 2,
        status: "started",
        error: "",
      });
    });
  }, 20000);

  it("#4900: should clear score comment on update with `null`", async () => {
    const scoreId = randomUUID();
    const score1 = {
      id: randomUUID(),
      type: "score-create",
      timestamp: new Date().toISOString(),
      body: {
        id: scoreId,
        name: "score-name",
        traceId: randomUUID(),
        value: 100.5,
        observationId: randomUUID(),
        comment: "Foo Bar",
      },
    };

    const score2 = {
      id: randomUUID(),
      type: "score-create",
      timestamp: new Date(Date.now() + 1000).toISOString(),
      body: {
        id: scoreId,
        name: "score-name",
        traceId: randomUUID(),
        value: 100.5,
        observationId: randomUUID(),
        comment: null, // Explicitly set to null to clear the comment
      },
    };

    const response = await postIngestion({
      batch: [score1, score2],
    });

    expect(response.status).toBe(207);

    await waitForExpect(async () => {
      const score = await getScoreById({ projectId, scoreId });
      expect(score).toBeDefined();
      expect(score!.id).toBe(scoreId);
      expect(score!.projectId).toBe(projectId);
      expect(score!.value).toEqual(100.5);
      expect(score!.comment).toBe(null);
    });
  }, 10000);
});
