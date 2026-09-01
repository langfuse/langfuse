import { randomUUID } from "node:crypto";
import { EvalTargetObject, EvalTemplateType } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  codeDefinition,
  createCodeEvaluator,
  createEvaluationRule,
} from "@/src/__tests__/server/stable-evaluation-public-api-test-utils";
import { EvaluatorService, RuleService } from "@/src/features/evals/server";
import {
  DeleteEvaluatorResponse,
  Evaluator,
  ListEvaluatorsResponse,
  LlmAsJudgeEvaluator,
  PublicApiError,
} from "@/src/features/public-api";

describe("stable evaluators public API", () => {
  it("creates evaluators", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const first = await createCodeEvaluator("same name", auth);
    const second = await createCodeEvaluator("same name", auth);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body).toMatchObject({
      name: "same name",
      type: "code",
      createdBy: null,
      version: 1,
      versionCreatedBy: null,
    });
    expect(first.body).not.toHaveProperty("latestVersion");

    const llmEvaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "friendly LLM evaluator",
        type: "llm_as_judge",
        prompt: "Input: {{input}}",
        modelConfig: null,
        variableMapping: null,
        outputDefinition: {
          dataType: "NUMERIC",
          minValue: 0,
          maxValue: 1,
        },
      },
      auth,
      201,
    );
    const llmEvaluatorBody = LlmAsJudgeEvaluator.parse(llmEvaluator.body);
    expect(llmEvaluatorBody).toMatchObject({
      type: "llm_as_judge",
      version: 1,
      prompt: [{ role: "user", content: "Input: {{input}}" }],
      variables: ["input"],
      variableMapping: null,
      modelConfig: null,
    });
    expect(llmEvaluatorBody.outputDefinition).toEqual({
      dataType: "NUMERIC",
      minValue: 0,
      maxValue: 1,
    });
    await expect(
      prisma.evaluatorVersion.findFirstOrThrow({
        where: { evaluatorId: llmEvaluator.body.id },
        orderBy: { version: "desc" },
        select: { prompt: true },
      }),
    ).resolves.toEqual({ prompt: "Input: {{input}}" });

    const categoricalEvaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "categorical evaluator",
        type: "llm_as_judge",
        prompt: [{ role: "user", content: "Classify: {{input}}" }],
        outputDefinition: {
          dataType: "CATEGORICAL",
          scoreReasoningInstructions: "Why the category was selected",
          scoreValueInstructions: "The selected category",
          categories: ["pass", "fail"],
          shouldAllowMultipleMatches: false,
        },
      },
      auth,
      201,
    );
    expect(
      LlmAsJudgeEvaluator.parse(categoricalEvaluator.body).outputDefinition,
    ).toEqual({
      dataType: "CATEGORICAL",
      scoreReasoningInstructions: "Why the category was selected",
      scoreValueInstructions: "The selected category",
      categories: ["pass", "fail"],
      shouldAllowMultipleMatches: false,
    });

    const patchedEvaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${categoricalEvaluator.body.id}`,
      {
        type: "llm_as_judge",
        prompt: "Classify updated: {{input}}",
        outputDefinition: {
          dataType: "BOOLEAN",
        },
      },
      auth,
    );
    expect(LlmAsJudgeEvaluator.parse(patchedEvaluator.body).prompt).toEqual([
      { role: "user", content: "Classify updated: {{input}}" },
    ]);

    const multiMessageEvaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "multi-message evaluator",
        type: "llm_as_judge",
        prompt: [
          { role: "system", content: "Judge carefully" },
          { role: "user", content: "Input: {{input}}" },
          { role: "assistant", content: "I will return a score" },
        ],
        outputDefinition: { dataType: "BOOLEAN" },
      },
      auth,
      201,
    );
    expect(
      LlmAsJudgeEvaluator.parse(multiMessageEvaluator.body).prompt,
    ).toEqual([
      { role: "system", content: "Judge carefully" },
      { role: "user", content: "Input: {{input}}" },
      { role: "assistant", content: "I will return a score" },
    ]);
    await expect(
      prisma.evaluatorVersion.findFirstOrThrow({
        where: { evaluatorId: multiMessageEvaluator.body.id },
        select: { prompt: true, promptMessages: true },
      }),
    ).resolves.toEqual({
      prompt: "Judge carefully\n\nInput: {{input}}\n\nI will return a score",
      promptMessages: [
        { role: "system", content: "Judge carefully" },
        { role: "user", content: "Input: {{input}}" },
        { role: "assistant", content: "I will return a score" },
      ],
    });

    for (const prompt of [
      [{ role: "developer", content: "Judge {{input}}" }],
      [
        { role: "user", content: "Judge {{input}}" },
        { role: "system", content: "Too late" },
      ],
      [{ role: "user", content: "   " }],
    ]) {
      const invalidPrompt = await makeAPICall(
        "POST",
        "/api/public/v2/evaluators",
        {
          name: "invalid prompt evaluator",
          type: "llm_as_judge",
          prompt,
          outputDefinition: { dataType: "BOOLEAN" },
        },
        auth,
      );
      expect(invalidPrompt.status).toBe(400);
      expect(PublicApiError.parse(invalidPrompt.body)).toMatchObject({
        code: "invalid_body",
      });
    }

    const invalidModelParams = await makeAPICall(
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "invalid model params",
        type: "llm_as_judge",
        prompt: "Judge {{input}}",
        modelConfig: {
          provider: "openai",
          model: "gpt-4.1-mini",
          modelParams: { temperature: 0 },
        },
        outputDefinition: { dataType: "BOOLEAN" },
      },
      auth,
    );
    expect(invalidModelParams.status).toBe(400);

    const invalid = await makeAPICall(
      "POST",
      "/api/public/v2/evaluators",
      { name: "missing type" },
      auth,
    );
    expect(invalid.status).toBe(400);
    expect(PublicApiError.parse(invalid.body)).toMatchObject({
      code: "invalid_body",
      details: { issues: expect.any(Array) },
    });

    const nestedDefinition = await makeAPICall(
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "nested definition",
        definition: codeDefinition("function evaluate() {}"),
      },
      auth,
    );
    expect(nestedDefinition.status).toBe(400);
  });

  it("gets an evaluator", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Evaluator Author",
        email: `${randomUUID()}@example.com`,
      },
    });
    const evaluator = await new EvaluatorService(
      prisma,
      async () => undefined,
    ).create(
      {
        projectId,
        name: "authored evaluator",
        description: null,
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [{ role: "user", content: "Judge {{input}}" }],
          vars: ["input"],
          provider: null,
          model: null,
          modelParams: null,
          variableMapping: null,
          outputDefinition: {
            dataType: "NUMERIC",
            reasoning: { description: "Explain the score" },
            score: { description: "Return the score" },
          },
        },
      },
      user.id,
    );
    const rule = await new RuleService(prisma, async () => undefined).create(
      {
        projectId,
        name: "associated rule",
        targetObject: EvalTargetObject.EVENT,
        enabled: false,
        sampling: 1,
        filter: [],
        evaluatorAssignments: [
          {
            evaluatorId: evaluator.id,
            variableMapping: [
              { templateVariable: "input", selectedColumnId: "input" },
            ],
          },
        ],
      },
      user.id,
    );

    const legacyRule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "legacy associated rule",
        targetObject: EvalTargetObject.TRACE,
        status: "INACTIVE",
        filter: [],
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
    });
    await prisma.evaluationRuleEvaluatorAssignment.create({
      data: {
        projectId,
        evaluationRuleId: legacyRule.id,
        evaluatorId: evaluator.id,
        variableMapping: [
          {
            templateVariable: "input",
            langfuseObject: "trace",
            objectName: null,
            selectedColumnId: "input",
            jsonSelector: null,
          },
        ],
      },
    });

    const response = await makeZodVerifiedAPICall(
      Evaluator,
      "GET",
      `/api/public/v2/evaluators/${evaluator.id}`,
      undefined,
      auth,
    );
    expect(response.body.createdBy).toEqual({
      id: user.id,
      name: user.name,
    });
    expect(response.body.versionCreatedBy).toEqual(response.body.createdBy);
    const expectedAssignments = expect.arrayContaining([
      {
        evaluationRuleId: rule.id,
        variableMappingOverride: [{ variable: "input", source: "input" }],
      },
      {
        evaluationRuleId: legacyRule.id,
        variableMappingOverride: [
          {
            mappingType: "legacy",
            variable: "input",
            langfuseObject: "trace",
            objectName: null,
            source: "input",
          },
        ],
      },
    ]);
    expect(response.body.evaluationRuleAssignments).toEqual(
      expectedAssignments,
    );

    const listResponse = await makeZodVerifiedAPICall(
      ListEvaluatorsResponse,
      "GET",
      "/api/public/v2/evaluators",
      undefined,
      auth,
    );
    expect(
      listResponse.body.data.find(({ id }) => id === evaluator.id)
        ?.evaluationRuleAssignments,
    ).toEqual(expectedAssignments);

    const legacyOutputEvaluator = await prisma.evaluator.create({
      data: {
        projectId,
        name: "legacy output evaluator",
        description: null,
        type: EvalTemplateType.LLM_AS_JUDGE,
        versions: {
          create: {
            version: 1,
            prompt: "Judge {{input}}",
            vars: ["input"],
            outputDefinition: { reasoning: "", score: "" },
          },
        },
      },
    });
    const legacyResponse = await makeZodVerifiedAPICall(
      Evaluator,
      "GET",
      `/api/public/v2/evaluators/${legacyOutputEvaluator.id}`,
      undefined,
      auth,
    );
    expect(legacyResponse.body).toMatchObject({
      version: 1,
      prompt: [{ role: "user", content: "Judge {{input}}" }],
      outputDefinition: {
        dataType: "NUMERIC",
      },
    });
  });

  it("returns 404 when getting an invalid evaluator ID", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "GET",
      `/api/public/v2/evaluators/${randomUUID()}`,
      undefined,
      auth,
    );
    expect(response.status).toBe(404);
    expect(PublicApiError.parse(response.body)).toMatchObject({
      code: "resource_not_found",
      message: "Evaluator not found",
    });
  });

  it("lists evaluators", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const created = await createCodeEvaluator("listed evaluator", auth);

    const response = await makeZodVerifiedAPICall(
      ListEvaluatorsResponse,
      "GET",
      "/api/public/v2/evaluators",
      undefined,
      auth,
    );
    expect(response.body.data).toContainEqual(
      expect.objectContaining({
        id: created.body.id,
        name: "listed evaluator",
      }),
    );

    const invalidQuery = await makeAPICall(
      "GET",
      "/api/public/v2/evaluators?limit=101",
      undefined,
      auth,
    );
    expect(invalidQuery.status).toBe(400);
    expect(PublicApiError.parse(invalidQuery.body)).toMatchObject({
      code: "invalid_query",
      details: { issues: expect.any(Array) },
    });
  });

  it("lists evaluators with cursor pagination", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const created = await Promise.all([
      createCodeEvaluator("cursor one", auth),
      createCodeEvaluator("cursor two", auth),
      createCodeEvaluator("cursor three", auth),
    ]);

    const firstPage = await makeZodVerifiedAPICall(
      ListEvaluatorsResponse,
      "GET",
      "/api/public/v2/evaluators?limit=2",
      undefined,
      auth,
    );
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.cursor).toEqual(expect.any(String));

    const secondPage = await makeZodVerifiedAPICall(
      ListEvaluatorsResponse,
      "GET",
      `/api/public/v2/evaluators?limit=2&cursor=${encodeURIComponent(firstPage.body.meta.cursor!)}`,
      undefined,
      auth,
    );
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.meta.cursor).toBeUndefined();

    const listedIds = [...firstPage.body.data, ...secondPage.body.data].map(
      ({ id }) => id,
    );
    expect(new Set(listedIds)).toEqual(
      new Set(created.map(({ body }) => body.id)),
    );
  });

  it("preserves model configuration when patching another field", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const evaluator = await new EvaluatorService(
      prisma,
      async () => undefined,
    ).create(
      {
        projectId,
        name: "configured evaluator",
        description: null,
        definition: {
          type: EvalTemplateType.LLM_AS_JUDGE,
          promptMessages: [{ role: "user", content: "Judge {{input}}" }],
          vars: ["input"],
          provider: "openai",
          model: "gpt-4.1-mini",
          modelParams: { temperature: 0.2 },
          variableMapping: null,
          outputDefinition: {
            dataType: "BOOLEAN",
            reasoning: { description: "Explain the score" },
            score: { description: "Return the score" },
          },
        },
      },
      null,
    );

    await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.id}`,
      {
        type: "llm_as_judge",
        prompt: "Judge carefully: {{input}}",
        outputDefinition: { dataType: "BOOLEAN" },
      },
      auth,
    );

    await expect(
      prisma.evaluatorVersion.findFirstOrThrow({
        where: { evaluatorId: evaluator.id },
        orderBy: { version: "desc" },
        select: {
          provider: true,
          model: true,
          modelParams: true,
        },
      }),
    ).resolves.toEqual({
      provider: "openai",
      model: "gpt-4.1-mini",
      modelParams: { temperature: 0.2 },
    });
  });

  it("patches an evaluator", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("concurrent evaluator", auth);
    const rule = await createEvaluationRule({
      name: "recovery assignment",
      evaluatorId: evaluator.body.id,
      auth,
    });
    await prisma.evaluator.update({
      where: { id: evaluator.body.id },
      data: {
        blockedAt: new Date(),
        blockReason: "EVAL_MODEL_CONFIG_INVALID",
        blockMessage: "Invalid model configuration",
      },
    });

    const recovered = await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      codeDefinition("function evaluate() { return { scores: [] }; }"),
      auth,
    );
    expect(recovered.body).toMatchObject({
      id: evaluator.body.id,
      status: "active",
      pausedAt: null,
      pausedReason: null,
      pausedMessage: null,
      version: 1,
      evaluationRuleAssignments: [{ evaluationRuleId: rule.body.id }],
    });

    const metadataUpdate = await makeZodVerifiedAPICall(
      Evaluator,
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      { description: "metadata-only description" },
      auth,
    );
    expect(metadataUpdate.body.version).toBe(1);

    const partialDefinition = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      { type: "code", sourceCode: "function evaluate() {}" },
      auth,
    );
    expect(partialDefinition.status).toBe(400);
    expect(PublicApiError.parse(partialDefinition.body).code).toBe(
      "invalid_body",
    );

    const changedSource =
      "function evaluate() { return { scores: [{ name: 'ok', value: true }] }; }";
    await Promise.all([
      makeZodVerifiedAPICall(
        Evaluator,
        "PATCH",
        `/api/public/v2/evaluators/${evaluator.body.id}`,
        { name: "concurrent renamed" },
        auth,
      ),
      makeZodVerifiedAPICall(
        Evaluator,
        "PATCH",
        `/api/public/v2/evaluators/${evaluator.body.id}`,
        { description: "concurrent description" },
        auth,
      ),
      makeZodVerifiedAPICall(
        Evaluator,
        "PATCH",
        `/api/public/v2/evaluators/${evaluator.body.id}`,
        codeDefinition(changedSource),
        auth,
      ),
    ]);

    const current = await makeZodVerifiedAPICall(
      Evaluator,
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );
    expect(current.body).toMatchObject({
      name: "concurrent renamed",
      description: "concurrent description",
      version: 2,
      sourceCode: changedSource,
    });

    const typeConflict = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      {
        type: "llm_as_judge",
        prompt: "Input: {{input}}",
        modelConfig: null,
        variableMapping: null,
        outputDefinition: {
          dataType: "BOOLEAN",
        },
      },
      auth,
    );
    expect(typeConflict.status).toBe(409);
    expect(PublicApiError.parse(typeConflict.body)).toMatchObject({
      code: "conflict",
      message: "Evaluator type cannot be changed",
    });
  });

  it("returns 404 when patching an invalid evaluator ID", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluators/${randomUUID()}`,
      { name: "missing evaluator" },
      auth,
    );
    expect(response.status).toBe(404);
  });

  it("deletes an evaluator", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("deleted evaluator", auth);

    const response = await makeZodVerifiedAPICall(
      DeleteEvaluatorResponse,
      "DELETE",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );
    expect(response.body.id).toBe(evaluator.body.id);

    const get = await makeAPICall(
      "GET",
      `/api/public/v2/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );
    expect(get.status).toBe(404);
  });

  it("returns 404 when deleting an invalid evaluator ID", async () => {
    const { auth } = await createOrgProjectAndApiKey();

    const response = await makeAPICall(
      "DELETE",
      `/api/public/v2/evaluators/${randomUUID()}`,
      undefined,
      auth,
    );
    expect(response.status).toBe(404);
  });
});
