import {
  randomUUID,
  makeAPICall,
  waitForExpect,
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
      const response = await postIngestion({
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
  ])(
    "should test special S3 characters in IDs (%s)",
    async (char: string) => {
      const traceId = randomUUID();

      const response = await postIngestion({
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
    },
    10000,
  );

  it("should fail for \\r in id", async () => {
    const traceId = v4();

    const response = await postIngestion({
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

    const response = await postIngestion({
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

    expect(response.body.errors.length).toBe(1);
    expect(response.body.errors[0].message).toBe("Invalid request data");
  });

  it("should silently drop invalid float values in usageDetails", async () => {
    const response = await postIngestion({
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
              key: 0.1, // invalid float - should be silently dropped
            },
          },
        },
      ],
    });

    // Event should succeed, invalid usageDetails values are silently dropped
    expect(response.status).toBe(207);
    expect(response.body.successes.length).toBe(1);
    expect(response.body.errors.length).toBe(0);
  });

  it.each([
    "langfuse-test",
    ".invalidcharacter!",
    "incrediblylongstringwithmorethan40characters",
  ])(
    "should fallback to default for invalid environments (%s)",
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

      const response = await postIngestion({
        batch: [entity],
      });

      expect(response.status).toBe(207);
      expect(response.body.successes.length).toBe(1);
      expect(response.body.errors.length).toBe(0);
    },
  );

  // Disabled until eventLog becomes the default behaviour.
});
