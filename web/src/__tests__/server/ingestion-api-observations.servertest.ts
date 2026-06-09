import {
  randomUUID,
  makeAPICall,
  waitForExpect,
  getObservationById,
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
    [
      "agent",
      "AGENT",
      {
        id: randomUUID(),
        type: "agent-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 1000).toISOString(),
          name: "AI Agent",
          input: "Process user request",
          output: "Request processed successfully",
          model: "claude-3-haiku",
          modelParameters: { temperature: 0.7, max_tokens: 1000 },
          usage: {
            input: 150,
            output: 75,
            total: 225,
            unit: "TOKENS",
            inputCost: 0.0015,
            outputCost: 0.003,
            totalCost: 0.0045,
          },
          usageDetails: { input: 150, output: 75, total: 225 },
          costDetails: { input: 0.0015, output: 0.003, total: 0.0045 },
        },
      },
    ],
    [
      "tool",
      "TOOL",
      {
        id: randomUUID(),
        type: "tool-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 2000).toISOString(),
          name: "Web Search Tool",
          input: "Search for current weather",
          output: "Weather data retrieved",
          model: "gpt-4o-mini",
          usage: {
            input: 50,
            output: 25,
            total: 75,
            unit: "TOKENS",
            inputCost: 0.0001,
            outputCost: 0.0002,
            totalCost: 0.0003,
          },
        },
      },
    ],
    [
      "chain",
      "CHAIN",
      {
        id: randomUUID(),
        type: "chain-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3000).toISOString(),
          name: "Processing Chain",
          input: "Multi-step task",
          output: "All steps completed",
          model: "gpt-4",
          usageDetails: { input: 800, output: 400, total: 1200 },
          costDetails: { input: 0.024, output: 0.048, total: 0.072 },
        },
      },
    ],
    [
      "retriever",
      "RETRIEVER",
      {
        id: randomUUID(),
        type: "retriever-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 1500).toISOString(),
          name: "Document Retriever",
          input: "Query document database",
          output: "Retrieved 5 relevant documents",
        },
      },
    ],
    [
      "evaluator",
      "EVALUATOR",
      {
        id: randomUUID(),
        type: "evaluator-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 800).toISOString(),
          name: "Quality Evaluator",
          input: "Evaluate response quality",
          output: "Quality score: 0.85",
        },
      },
    ],
    [
      "embedding",
      "EMBEDDING",
      {
        id: randomUUID(),
        type: "embedding-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 500).toISOString(),
          name: "Text Embedding",
          input: "Text to embed",
          output: "Embedding vector generated",
          model: "text-embedding-ada-002",
          usage: {
            input: 20,
            output: 0,
            total: 20,
            unit: "TOKENS",
            totalCost: 0.00004,
          },
        },
      },
    ],
    [
      "guardrail",
      "GUARDRAIL",
      {
        id: randomUUID(),
        type: "guardrail-create",
        timestamp: new Date().toISOString(),
        body: {
          id: randomUUID(),
          traceId: randomUUID(),
          startTime: new Date().toISOString(),
        },
      },
    ],
  ])(
    "should create observations via the ingestion API (%s)",
    async (_name: string, type: string, entity: any) => {
      const response = await postIngestion({
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
      }, 15_000);
    },
    20_000,
  );
});
