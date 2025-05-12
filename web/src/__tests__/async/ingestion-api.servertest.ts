import { randomUUID } from "crypto";
import { makeAPICall } from "@/src/__tests__/test-utils";
import waitForExpect from "wait-for-expect";
import {
  getBlobStorageByProjectAndEntityId,
  getObservationById,
  getScoreById,
  getTraceById,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/ingestion API Endpoint", () => {
  it.each([
    [
      "plain",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
        },
      },
    ],
    [
      "metadata+io",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: "input",
          output: "output",
        },
      },
    ],
    [
      "complex-io",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: ["hello", { world: "world" }, [1, 2, 3]],
        },
      },
    ],
    [
      "non-default-environment",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: ["hello", { world: "world" }, [1, 2, 3]],
          environment: "production",
        },
      },
    ],
    [
      "emojis in i/o",
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: { hello: "world" },
          input: "🪢🚀🌖",
          output: "👋🌍",
        },
      },
    ],
  ])(
    "should create traces via the ingestion API (%s)",
    async (_name: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const trace = await getTraceById({
          traceId: entity.body.id,
          projectId,
        });
        expect(trace).toBeDefined();
        expect(trace!.id).toBe(entity.body.id);
        expect(trace!.projectId).toBe(projectId);
        expect(trace!.metadata).toEqual(entity.body?.metadata ?? {});
        expect(trace!.input).toEqual(entity.body?.input ?? null);
        expect(trace!.output).toEqual(entity.body?.output ?? null);
        expect(trace!.environment).toEqual(
          entity.body?.environment ?? "default",
        );
      });
    },
  );

  // Disabled within test sequence as we're using a clickhouse version which doesn't support this
  // it("should replace bad escape sequences on clickhouse", async () => {
  //   const entity = {
  //     id: randomUUID(),
  //     type: "trace-create",
  //     timestamp: new Date().toISOString(),
  //     body: {
  //       id: randomUUID(),
  //       timestamp: new Date().toISOString(),
  //       metadata: { hello: "world" },
  //       input: "test\\ud8000test",
  //       environment: "production",
  //     },
  //   };
  //   const response = await makeAPICall("POST", "/api/public/ingestion", {
  //     batch: [entity],
  //   });
  //
  //   expect(response.status).toBe(207);
  //   await waitForExpect(async () => {
  //     const trace = await getTraceById({ traceId: entity.body.id, projectId });
  //     expect(trace).toBeDefined();
  //     expect(trace!.id).toBe(entity.body.id);
  //     expect(trace!.projectId).toBe(projectId);
  //     expect(trace!.input).toContain("test");
  //   });
  // });

  it.each([
    [
      "generation",
      "GENERATION",
      {
        id: randomUUID(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          parentObservationId: randomUUID(),
          startTime: new Date().toISOString(),
          model: "gpt-4",
          input: { text: "input" },
          output: { text: "output" },
        },
      },
    ],
    [
      "span",
      "SPAN",
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
        },
      },
    ],
    [
      "span-complex-io",
      "SPAN",
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          input: ["hello", { world: "world" }, [1, 2, 3]],
          output: ["hello", { world: [2, 3, "test"] }, [1, 2, 3]],
        },
      },
    ],
    [
      "span-non-default-environment",
      "SPAN",
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          input: ["hello", { world: "world" }, [1, 2, 3]],
          output: ["hello", { world: [2, 3, "test"] }, [1, 2, 3]],
          environment: "production",
        },
      },
    ],
  ])(
    "should create observations via the ingestion API (%s)",
    async (_name: string, type: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const observation = await getObservationById({
          id: entity.body.id,
          projectId,
          fetchWithInputOutput: true,
        });
        expect(observation).toBeDefined();
        expect(observation!.id).toBe(entity.body.id);
        expect(observation!.projectId).toBe(projectId);
        expect(observation!.metadata).toEqual(entity.body?.metadata ?? {});
        expect(observation!.input).toEqual(entity.body?.input ?? null);
        expect(observation!.output).toEqual(entity.body?.output ?? null);
        expect(observation!.type).toBe(type);
        expect(observation!.environment).toEqual(
          entity.body?.environment ?? "default",
        );
      });
    },
  );

  it.each([
    [
      "plain",
      {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          name: "score-name",
          traceId: randomUUID(),
          value: 100.5,
          observationId: randomUUID(),
        },
      },
    ],
    [
      "non-default-environment",
      {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          name: "score-name",
          traceId: randomUUID(),
          value: 100.5,
          observationId: randomUUID(),
          environment: "production",
        },
      },
    ],
  ])(
    "should create scores via the ingestion API (%s)",
    async (_name: string, entity: any) => {
      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);

      await waitForExpect(async () => {
        const score = await getScoreById({
          projectId,
          scoreId: entity.body.id,
        });
        expect(score).toBeDefined();
        expect(score!.id).toBe(entity.body.id);
        expect(score!.projectId).toBe(projectId);
        expect(score!.value).toEqual(100.5);
        expect(score!.environment).toEqual(
          entity.body?.environment ?? "default",
        );
      });
    },
  );

  it.each([
    "&",
    "$",
    "@",
    "=",
    ";",
    "/",
    "+",
    " ",
    ",",
    "?",
    // "\\",
    "{",
    "}",
    "^",
    "%",
    "`",
    "]",
    '"',
    ">",
    "[",
    "~",
    "<",
    "#",
    "|",
  ])("should test special S3 characters in IDs (%s)", async (char: string) => {
    const traceId = randomUUID();

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: `${traceId}-${char}-test`,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    await waitForExpect(async () => {
      const trace = await getTraceById({
        traceId: `${traceId}-${char}-test`,
        projectId,
      });
      expect(trace).toBeDefined();
      expect(trace!.id).toBe(`${traceId}-${char}-test`);
      expect(trace!.projectId).toBe(projectId);
      expect(trace!.environment).toEqual("default");
    });
  });

  it("should fail for \\r in id", async () => {
    const traceId = v4();

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: `${v4()}-\r-test`,
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
      ],
    });

    expect(response.status).toBe(207);
    expect("errors" in response.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors[0].message).toBe("Invalid request data");
    expect(response.body.errors[0].error).toContain(
      "ID cannot contain carriage return characters",
    );
  });

  it("should fail for long trace name", async () => {
    const traceId = v4();

    const baseString =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
    const repeatCount = Math.ceil(1500 / baseString.length);
    const name = baseString.repeat(repeatCount);

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name,
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
      ],
    });

    expect(response.status).toBe(207);
    expect("errors" in response.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors[0].message).toBe("Invalid request data");
  });

  it("should fail for float in usageDetails", async () => {
    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: randomUUID(),
            traceId: randomUUID(),
            parentObservationId: randomUUID(),
            startTime: new Date().toISOString(),
            model: "gpt-4",
            input: { text: "input" },
            output: { text: "output" },
            usageDetails: {
              key: 0.1,
            },
          },
        },
      ],
    });

    expect(response.status).toBe(207);
    expect("errors" in response.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors[0].message).toBe("Invalid request data");
  });

  it.each([
    "langfuse-test",
    ".invalidcharacter!",
    "incrediblylongstringwithmorethan40characters",
  ])(
    "should fail for invalid environments (%s)",
    async (environment: string) => {
      const entity = {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          name: "score-name",
          traceId: randomUUID(),
          value: 100.5,
          observationId: randomUUID(),
          environment,
        },
      };

      const response = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [entity],
      });

      expect(response.status).toBe(207);
      expect(response.body.errors[0].status).toBe(400);
    },
  );

  // Disabled until eventLog becomes the default behaviour.
  it("should create a log entry for the S3 file", async () => {
    const traceId = v4();
    const eventId = v4();

    const response = await makeAPICall("POST", "/api/public/ingestion", {
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

      const response = await makeAPICall("POST", "/api/public/ingestion", {
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

      const response = await makeAPICall("POST", "/api/public/ingestion", {
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

      const response = await makeAPICall("POST", "/api/public/ingestion", {
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

    const response = await makeAPICall("POST", "/api/public/ingestion", {
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
  });
});
