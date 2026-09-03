import { randomUUID } from "node:crypto";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  codeDefinition,
  createCodeEvaluator,
} from "@/src/__tests__/server/stable-evaluation-public-api-test-utils";
import {
  Evaluator,
  ListEvaluatorVersionsResponse,
} from "@/src/features/public-api";

describe("stable evaluator history public API", () => {
  it("lists evaluator version history", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("history evaluator", auth);
    const changedSource =
      "function evaluate() { return { scores: [{ name: 'ok', value: true }] }; }";
    await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      codeDefinition(changedSource),
      auth,
    );

    const response = await makeZodVerifiedAPICall(
      ListEvaluatorVersionsResponse,
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}/versions`,
      undefined,
      auth,
    );
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map(({ version }) => version)).toEqual([2, 1]);
    expect(response.body.data[0]).toMatchObject({
      type: "code",
      version: 2,
      sourceCode: changedSource,
      createdBy: null,
    });
    expect(response.body.meta.cursor).toBeUndefined();
  });

  it("preserves multi-message prompts in evaluator version history", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "multi-message history evaluator",
        type: "llm_as_judge",
        prompt: [
          { role: "system", content: "Judge consistently" },
          { role: "user", content: "Input: {{input}}" },
        ],
        outputDefinition: { dataType: "BOOLEAN" },
      },
      auth,
      201,
    );
    await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      {
        type: "llm_as_judge",
        prompt: [
          { role: "system", content: "Judge very consistently" },
          { role: "user", content: "Input: {{input}}" },
          { role: "assistant", content: "I will return a score" },
        ],
        outputDefinition: { dataType: "BOOLEAN" },
      },
      auth,
    );

    const response = await makeZodVerifiedAPICall(
      ListEvaluatorVersionsResponse,
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}/versions`,
      undefined,
      auth,
    );
    expect(
      response.body.data.map((version) =>
        version.type === "llm_as_judge" ? version.prompt : null,
      ),
    ).toEqual([
      [
        { role: "system", content: "Judge very consistently" },
        { role: "user", content: "Input: {{input}}" },
        { role: "assistant", content: "I will return a score" },
      ],
      [
        { role: "system", content: "Judge consistently" },
        { role: "user", content: "Input: {{input}}" },
      ],
    ]);
  });

  it("returns 404 for an invalid evaluator ID with or without a cursor", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluatorId = randomUUID();
    const cursor = Buffer.from(JSON.stringify({ v: 1, version: 1 })).toString(
      "base64url",
    );

    for (const query of ["", `?cursor=${encodeURIComponent(cursor)}`]) {
      const response = await makeAPICall(
        "GET",
        `/api/public/v2/evaluators/${evaluatorId}/versions${query}`,
        undefined,
        auth,
      );
      expect(response.status).toBe(404);
    }
  });

  it("lists evaluator version history with cursor pagination", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator(
      "paginated history evaluator",
      auth,
    );
    await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      codeDefinition(
        "function evaluate() { return { scores: [{ name: 'ok', value: true }] }; }",
      ),
      auth,
    );

    const firstPage = await makeZodVerifiedAPICall(
      ListEvaluatorVersionsResponse,
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}/versions?limit=1`,
      undefined,
      auth,
    );
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0]?.version).toBe(2);
    expect(firstPage.body.meta.cursor).toEqual(expect.any(String));

    const secondPage = await makeZodVerifiedAPICall(
      ListEvaluatorVersionsResponse,
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}/versions?limit=1&cursor=${encodeURIComponent(firstPage.body.meta.cursor!)}`,
      undefined,
      auth,
    );
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0]?.version).toBe(1);
    expect(secondPage.body.meta.cursor).toBeUndefined();
  });
});
