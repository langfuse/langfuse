import {
  randomUUID,
  makeAPICall,
  waitForExpect,
  getTraceById,
  createOrgProjectAndApiKey,
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
      const response = await postIngestion({
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
  //   const response = await postIngestion({
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
});
