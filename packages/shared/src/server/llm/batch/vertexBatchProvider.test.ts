import { describe, expect, it, vi } from "vitest";
import { VertexAIConfigSchema } from "../../../interfaces/customLLMProviderConfigSchemas";
import {
  createVertexBatchProviderWithRequest,
  parseVertexBatchOutput,
  stripBatchUnsafeKeys,
  VERTEX_BATCH_ID_LABEL,
  VERTEX_SUBMISSION_ID_LABEL,
  type GoogleApiRequest,
} from "./vertexBatchProvider";

const JOB_NAME = "projects/123/locations/global/batchPredictionJobs/456";

function setup(responses: Record<string, unknown> = {}) {
  const request = vi.fn<GoogleApiRequest>(async ({ url }) => {
    for (const [prefix, response] of Object.entries(responses)) {
      if (url.startsWith(prefix)) return response;
    }
    return {};
  });
  const provider = createVertexBatchProviderWithRequest({
    project: "my-project",
    location: "global",
    gcsUri: "gs://my-bucket/langfuse/batch",
    request,
  });
  return { request, provider };
}

describe("VertexAIConfigSchema batchGcsUri", () => {
  it("accepts bucket and bucket/prefix URIs", () => {
    for (const batchGcsUri of ["gs://my-bucket", "gs://my-bucket/a/b"]) {
      expect(VertexAIConfigSchema.safeParse({ batchGcsUri }).success).toBe(
        true,
      );
    }
  });

  it("rejects other URIs", () => {
    for (const batchGcsUri of [
      "s3://my-bucket",
      "gs://my-bucket/",
      "gs://My_Bucket",
      "https://storage.googleapis.com/my-bucket",
      "gs://my-bucket/a b",
    ]) {
      expect(VertexAIConfigSchema.safeParse({ batchGcsUri }).success).toBe(
        false,
      );
    }
  });
});

describe("Vertex AI batch provider", () => {
  it("uploads JSONL with the row id label and creates a batch job", async () => {
    const { request, provider } = setup({
      "https://aiplatform.googleapis.com/": { name: JOB_NAME },
    });

    const jobName = await provider.submit({
      model: "gemini-4-argon",
      submissionId: "20261102t100000-abcd1234",
      items: [
        { id: "row1", request: { contents: [{ parts: [{ text: "a" }] }] } },
        {
          id: "row2",
          request: { contents: [], labels: { team: "evals" } },
        },
      ],
    });

    expect(jobName).toBe(JOB_NAME);
    const [upload, create] = request.mock.calls.map(([opts]) => opts);
    expect(upload.url).toBe(
      "https://storage.googleapis.com/upload/storage/v1/b/my-bucket/o?uploadType=media&name=langfuse%2Fbatch%2F20261102t100000-abcd1234%2Finput.jsonl",
    );
    expect(upload.method).toBe("POST");
    const lines = upload
      .body!.trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toEqual([
      {
        request: {
          contents: [{ parts: [{ text: "a" }] }],
          labels: { [VERTEX_BATCH_ID_LABEL]: "row1" },
        },
      },
      {
        request: {
          contents: [],
          labels: { team: "evals", [VERTEX_BATCH_ID_LABEL]: "row2" },
        },
      },
    ]);

    expect(create.url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/batchPredictionJobs",
    );
    expect(JSON.parse(create.body!)).toEqual({
      displayName: "langfuse-20261102t100000-abcd1234",
      model: "publishers/google/models/gemini-4-argon",
      labels: { [VERTEX_SUBMISSION_ID_LABEL]: "20261102t100000-abcd1234" },
      inputConfig: {
        instancesFormat: "jsonl",
        gcsSource: {
          uris: [
            "gs://my-bucket/langfuse/batch/20261102t100000-abcd1234/input.jsonl",
          ],
        },
      },
      outputConfig: {
        predictionsFormat: "jsonl",
        gcsDestination: {
          outputUriPrefix:
            "gs://my-bucket/langfuse/batch/20261102t100000-abcd1234/output",
        },
      },
    });
  });

  it("uses the regional host outside the global location", async () => {
    const request = vi.fn<GoogleApiRequest>(async () => ({ name: JOB_NAME }));
    const provider = createVertexBatchProviderWithRequest({
      project: "p",
      location: "europe-west4",
      gcsUri: "gs://b",
      request,
    });

    await provider.submit({ model: "m", submissionId: "s", items: [] });

    expect(request.mock.calls[1][0].url).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/p/locations/europe-west4/batchPredictionJobs",
    );
  });

  it("rejects submission ids that are not valid Vertex label values", async () => {
    const { request, provider } = setup();
    for (const submissionId of ["Upper", "a/b", "x".repeat(64), ""]) {
      await expect(
        provider.submit({ model: "m", submissionId, items: [] }),
      ).rejects.toThrow("Invalid batch submission id");
      await expect(provider.findJob(submissionId)).rejects.toThrow(
        "Invalid batch submission id",
      );
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("finds a submitted job by its submission label", async () => {
    const { request, provider } = setup({
      "https://aiplatform.googleapis.com/": {
        batchPredictionJobs: [{ name: JOB_NAME }],
      },
    });

    await expect(provider.findJob("sub-1")).resolves.toBe(JOB_NAME);
    const url = new URL(request.mock.calls[0][0].url);
    expect(url.pathname).toBe(
      "/v1/projects/my-project/locations/global/batchPredictionJobs",
    );
    expect(url.searchParams.get("filter")).toBe(
      `labels.${VERTEX_SUBMISSION_ID_LABEL}="sub-1"`,
    );
  });

  it("returns null when no job has the submission label", async () => {
    const { provider } = setup({
      "https://aiplatform.googleapis.com/": {},
    });
    await expect(provider.findJob("sub-1")).resolves.toBeNull();
  });

  it("reports running jobs without reading output", async () => {
    const { request, provider } = setup({
      "https://aiplatform.googleapis.com/v1/projects": {
        state: "JOB_STATE_RUNNING",
      },
    });

    await expect(provider.poll(JOB_NAME)).resolves.toEqual({
      state: "running",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reads every output file of a finished job", async () => {
    const ok = JSON.stringify({
      request: { labels: { [VERTEX_BATCH_ID_LABEL]: "row1" } },
      response: { candidates: [] },
      status: "",
    });
    const failed = JSON.stringify({
      request: { labels: { [VERTEX_BATCH_ID_LABEL]: "row2" } },
      status: "Request blocked",
    });
    const { request, provider } = setup({
      "https://aiplatform.googleapis.com/v1/projects": {
        state: "JOB_STATE_PARTIALLY_SUCCEEDED",
        outputInfo: {
          gcsOutputDirectory: "gs://my-bucket/langfuse/batch/s/output/job-1",
        },
      },
      "https://storage.googleapis.com/storage/v1/b/my-bucket/o?prefix=": {
        items: [
          { name: "langfuse/batch/s/output/job-1/predictions.jsonl" },
          { name: "langfuse/batch/s/output/job-1/other.txt" },
        ],
      },
      "https://storage.googleapis.com/storage/v1/b/my-bucket/o/": `${ok}\n${failed}\n`,
    });

    const result = await provider.poll(JOB_NAME);

    expect(result).toEqual({
      state: "done",
      jobError: undefined,
      results: new Map([
        ["row1", { ok: true, response: { candidates: [] } }],
        [
          "row2",
          { ok: false, error: "Vertex AI batch item failed: Request blocked" },
        ],
      ]),
    });
    expect(request.mock.calls.map(([o]) => o.url)).toEqual([
      `https://aiplatform.googleapis.com/v1/${JOB_NAME}`,
      "https://storage.googleapis.com/storage/v1/b/my-bucket/o?prefix=langfuse%2Fbatch%2Fs%2Foutput%2Fjob-1%2F",
      "https://storage.googleapis.com/storage/v1/b/my-bucket/o/langfuse%2Fbatch%2Fs%2Foutput%2Fjob-1%2Fpredictions.jsonl?alt=media",
    ]);
  });

  it("reports a failed job with its error", async () => {
    const { provider } = setup({
      "https://aiplatform.googleapis.com/v1/projects": {
        state: "JOB_STATE_FAILED",
        error: { message: "Permission denied on bucket" },
      },
    });

    await expect(provider.poll(JOB_NAME)).resolves.toEqual({
      state: "done",
      results: new Map(),
      jobError:
        "Vertex AI batch job ended in JOB_STATE_FAILED: Permission denied on bucket",
    });
  });

  it("refuses job names that are not Vertex batch job names", async () => {
    const { request, provider } = setup();

    await expect(
      provider.poll("projects/p/locations/x.evil.com/batchPredictionJobs/1"),
    ).rejects.toThrow("Unexpected Vertex AI batch job name");
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses locations that could reshape the Vertex host", () => {
    expect(() =>
      createVertexBatchProviderWithRequest({
        project: "p",
        location: "evil.com/x",
        gcsUri: "gs://b",
        request: vi.fn(),
      }),
    ).toThrow("Invalid Vertex AI location");
  });
});

describe("stripBatchUnsafeKeys", () => {
  it("drops $schema, which Vertex batch input rejects, and keeps the rest", () => {
    const request = {
      contents: [{ role: "user", parts: [{ text: "$schema stays in text" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            score: { type: "number" },
            nested: { $schema: "x", type: "object" },
          },
          required: ["score"],
        },
      },
    };

    expect(stripBatchUnsafeKeys(request)).toEqual({
      contents: [{ role: "user", parts: [{ text: "$schema stays in text" }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            score: { type: "number" },
            nested: { type: "object" },
          },
          required: ["score"],
        },
      },
    });
  });
});

describe("parseVertexBatchOutput", () => {
  it("skips blank, unparseable and unlabeled lines", () => {
    const results = parseVertexBatchOutput([
      "",
      "not json",
      JSON.stringify({ request: {}, response: {} }),
      JSON.stringify({
        request: { labels: { [VERTEX_BATCH_ID_LABEL]: "row1" } },
        response: { candidates: [] },
        status: {},
      }),
    ]);

    expect(results).toEqual(
      new Map([["row1", { ok: true, response: { candidates: [] } }]]),
    );
  });

  it("treats a structured status as an item error", () => {
    const results = parseVertexBatchOutput([
      JSON.stringify({
        request: { labels: { [VERTEX_BATCH_ID_LABEL]: "row1" } },
        status: { code: 8, message: "quota" },
      }),
    ]);

    expect(results.get("row1")).toEqual({
      ok: false,
      error: 'Vertex AI batch item failed: {"code":8,"message":"quota"}',
    });
  });
});
