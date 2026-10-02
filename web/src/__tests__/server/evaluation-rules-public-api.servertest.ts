import { randomUUID } from "node:crypto";
import { EvalTargetObject, EvalTemplateType } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  createCodeEvaluator,
  createEvaluationRule,
} from "@/src/__tests__/server/stable-evaluation-public-api-test-utils";
import { EvaluatorService, RuleService } from "@/src/features/evals/server";
import {
  DeleteEvaluationRuleResponse,
  EvaluationRule,
  Evaluator,
  ListEvaluationRulesResponse,
  PublicApiError,
} from "@/src/features/public-api";

const createLegacyRule = (projectId: string, name: string) =>
  prisma.evaluationRule.create({
    data: {
      projectId,
      name,
      targetObject: EvalTargetObject.TRACE,
      status: "INACTIVE",
      filter: [
        {
          type: "string",
          column: "Trace Name",
          key: "legacy-filter-key",
          operator: "=",
          value: "legacy trace",
        },
      ],
      sampling: 1,
      delay: 0,
      timeScope: ["NEW"],
    },
  });

describe("stable evaluation rules public API", () => {
  it("creates evaluation rules", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("rule evaluator", auth);
    const datasetId = randomUUID();
    const body = {
      name: "same rule name",
      enabled: false,
      filter: [
        {
          type: "boolean" as const,
          column: "isExperimentItemRootSpan" as const,
          operator: "=" as const,
          value: true,
        },
        {
          type: "stringOptions" as const,
          column: "datasetId" as const,
          operator: "any of" as const,
          value: [datasetId],
        },
        {
          type: "null" as const,
          column: "parentObservationId" as const,
          operator: "is null" as const,
          value: "" as const,
        },
      ],
      evaluatorAssignments: [
        { evaluatorId: evaluator.body.id, variableMapping: null },
      ],
    };

    const first = await makeZodVerifiedAPICall(
      EvaluationRule,
      "POST",
      "/api/public/v2/evaluation-rules",
      body,
      auth,
      201,
    );
    const second = await makeZodVerifiedAPICall(
      EvaluationRule,
      "POST",
      "/api/public/v2/evaluation-rules",
      body,
      auth,
      201,
    );
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body).toMatchObject({
      createdBy: null,
      sampling: 1,
      evaluatorAssignments: [
        {
          evaluatorId: evaluator.body.id,
          variableMapping: null,
        },
      ],
    });
    expect(first.body).not.toHaveProperty("target");
    expect(first.body.filter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column: "isExperimentItemRootSpan",
          value: true,
        }),
        expect.objectContaining({
          column: "datasetId",
          value: [datasetId],
        }),
        expect.objectContaining({
          type: "null",
          column: "parentObservationId",
          operator: "is null",
          value: "",
        }),
      ]),
    );

    const nullSampling = await makeAPICall(
      "POST",
      "/api/public/v2/evaluation-rules",
      {
        ...body,
        name: "invalid nullable sampling",
        sampling: null,
      },
      auth,
    );
    expect(nullSampling.status).toBe(400);

    const enabledWithoutEvaluator = await makeAPICall(
      "POST",
      "/api/public/v2/evaluation-rules",
      {
        name: "invalid active draft",
        enabled: true,
        sampling: 1,
        filter: [],
        evaluatorAssignments: [],
      },
      auth,
    );
    expect(enabledWithoutEvaluator.status).toBe(400);
  });

  it("gets an evaluation rule", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Rule Author",
        email: `${randomUUID()}@example.com`,
      },
    });
    const evaluator = await new EvaluatorService(
      prisma,
      async () => undefined,
    ).create(
      {
        projectId,
        name: "rule author evaluator",
        description: null,
        definition: {
          type: EvalTemplateType.CODE,
          sourceCode: "function evaluate() { return { scores: [] }; }",
          sourceCodeLanguage: "TYPESCRIPT",
        },
      },
      user.id,
    );
    const rule = await new RuleService(prisma, async () => undefined).create(
      {
        projectId,
        name: "authored rule",
        targetObject: EvalTargetObject.EVENT,
        enabled: false,
        sampling: 1,
        filter: [],
        evaluatorAssignments: [
          { evaluatorId: evaluator.id, variableMapping: null },
        ],
      },
      user.id,
    );

    const response = await makeZodVerifiedAPICall(
      EvaluationRule,
      "GET",
      `/api/public/v2/evaluation-rules/${rule.id}`,
      undefined,
      auth,
    );
    expect(response.body.createdBy).toEqual({
      id: user.id,
      name: user.name,
    });

    const legacy = await createLegacyRule(projectId, "legacy get rule");
    await prisma.evaluationRule.update({
      where: { id: legacy.id },
      data: {
        filter: [
          {
            type: "string",
            column: "Trace Name",
            operator: "=",
            value: "legacy trace",
          },
          {
            type: "booleanObject",
            column: "metadata",
            key: "reviewed",
            operator: "=",
            value: true,
          },
          {
            type: "positionInTrace",
            column: "positionInTrace",
            operator: "=",
            key: "root",
          },
        ],
      },
    });
    await prisma.evaluationRuleEvaluatorAssignment.create({
      data: {
        projectId,
        evaluationRuleId: legacy.id,
        evaluatorId: evaluator.id,
        variableMapping: [
          {
            templateVariable: "input",
            langfuseObject: "trace",
            objectName: null,
            selectedColumnId: "input",
            jsonSelector: null,
          },
          {
            templateVariable: "output",
            langfuseObject: "generation",
            objectName: "answer-generation",
            selectedColumnId: "output",
            jsonSelector: "$.answer",
          },
        ],
      },
    });
    const legacyResponse = await makeZodVerifiedAPICall(
      EvaluationRule,
      "GET",
      `/api/public/v2/evaluation-rules/${legacy.id}`,
      undefined,
      auth,
    );
    expect(legacyResponse.body).toMatchObject({
      id: legacy.id,
      filter: [
        { column: "Trace Name", value: "legacy trace" },
        {
          type: "booleanObject",
          column: "metadata",
          key: "reviewed",
          value: true,
        },
        {
          type: "positionInTrace",
          column: "positionInTrace",
          key: "root",
        },
      ],
      evaluatorAssignments: [
        {
          variableMapping: [
            {
              mappingType: "legacy",
              variable: "input",
              langfuseObject: "trace",
              objectName: null,
              source: "input",
            },
            {
              mappingType: "legacy",
              variable: "output",
              langfuseObject: "generation",
              objectName: "answer-generation",
              source: "output",
              jsonPath: "$.answer",
            },
          ],
        },
      ],
    });
  });

  it("returns 404 when getting an invalid evaluation rule ID", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const missing = await makeAPICall(
      "GET",
      `/api/public/v2/evaluation-rules/${randomUUID()}`,
      undefined,
      auth,
    );
    expect(missing.status).toBe(404);
  });

  it("rejects an LLM evaluator assignment when no variable mapping is configured", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await makeZodVerifiedAPICall(
      Evaluator,
      "POST",
      "/api/public/v2/evaluators",
      {
        name: "LLM evaluator without default mapping",
        type: "llm_as_judge",
        prompt: [{ role: "user", content: "Judge {{input}}" }],
        outputDefinition: {
          dataType: "NUMERIC",
          minValue: 0,
          maxValue: 1,
        },
      },
      auth,
      201,
    );

    const rule = await makeAPICall(
      "POST",
      "/api/public/v2/evaluation-rules",
      {
        name: "Rule without variable mapping",
        enabled: false,
        evaluatorAssignments: [{ evaluatorId: evaluator.body.id }],
      },
      auth,
    );

    expect(rule.status).toBe(400);
    expect(PublicApiError.parse(rule.body)).toMatchObject({
      code: "invalid_request",
      message: "Missing mappings for evaluator variables: input",
    });
  });

  it("lists evaluation rules", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("listed rule evaluator", auth);
    const modern = await createEvaluationRule({
      name: "listed modern rule",
      evaluatorId: evaluator.body.id,
      auth,
    });
    const legacy = await createLegacyRule(projectId, "legacy listed rule");

    const response = await makeZodVerifiedAPICall(
      ListEvaluationRulesResponse,
      "GET",
      "/api/public/v2/evaluation-rules",
      undefined,
      auth,
    );
    expect(response.body.data).toContainEqual(
      expect.objectContaining({ id: modern.body.id }),
    );
    expect(response.body.data.find(({ id }) => id === legacy.id)).toMatchObject(
      {
        id: legacy.id,
        filter: [
          {
            type: "string",
            column: "Trace Name",
            key: "legacy-filter-key",
            operator: "=",
            value: "legacy trace",
          },
        ],
      },
    );
  });

  it("lists evaluation rules with cursor pagination", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator(
      "paginated rule evaluator",
      auth,
    );
    const created = await Promise.all([
      createEvaluationRule({
        name: "paginated rule one",
        evaluatorId: evaluator.body.id,
        auth,
      }),
      createEvaluationRule({
        name: "paginated rule two",
        evaluatorId: evaluator.body.id,
        auth,
      }),
    ]);

    const firstPage = await makeZodVerifiedAPICall(
      ListEvaluationRulesResponse,
      "GET",
      "/api/public/v2/evaluation-rules?limit=1",
      undefined,
      auth,
    );
    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.meta.cursor).toEqual(expect.any(String));

    const secondPage = await makeZodVerifiedAPICall(
      ListEvaluationRulesResponse,
      "GET",
      `/api/public/v2/evaluation-rules?limit=1&cursor=${encodeURIComponent(firstPage.body.meta.cursor!)}`,
      undefined,
      auth,
    );
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.meta.cursor).toBeUndefined();
    expect(
      new Set(
        [...firstPage.body.data, ...secondPage.body.data].map(({ id }) => id),
      ),
    ).toEqual(new Set(created.map(({ body: { id } }) => id)));
  });

  it("patches an evaluation rule", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("patched rule evaluator", auth);
    const rule = await createEvaluationRule({
      name: "rule before patch",
      evaluatorId: evaluator.body.id,
      auth,
    });

    const response = await makeZodVerifiedAPICall(
      EvaluationRule,
      "PATCH",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      { name: "rule after patch", sampling: 0.5 },
      auth,
    );
    expect(response.body).toMatchObject({
      id: rule.body.id,
      name: "rule after patch",
      sampling: 0.5,
    });

    const contradictory = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      { enabled: true, evaluatorAssignments: [] },
      auth,
    );
    expect(contradictory.status).toBe(400);
    expect(PublicApiError.parse(contradictory.body)).toMatchObject({
      code: "invalid_request",
      message:
        "An enabled evaluation rule requires at least one evaluator assignment",
    });

    const detached = await makeZodVerifiedAPICall(
      EvaluationRule,
      "PATCH",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      { evaluatorAssignments: [] },
      auth,
    );
    expect(detached.body).toMatchObject({
      enabled: false,
      evaluatorAssignments: [],
    });

    const enableWithoutAssignments = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      { enabled: true },
      auth,
    );
    expect(enableWithoutAssignments.status).toBe(400);

    const storedExperimentRule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "stored experiment rule",
        targetObject: EvalTargetObject.EVENT,
        status: "INACTIVE",
        filter: [
          {
            type: "boolean",
            column: "isExperimentItemRootSpan",
            operator: "=",
            value: true,
          },
        ],
        sampling: 1,
        delay: 0,
        timeScope: ["NEW"],
      },
    });
    const experimentResponse = await makeZodVerifiedAPICall(
      EvaluationRule,
      "PATCH",
      `/api/public/v2/evaluation-rules/${storedExperimentRule.id}`,
      { filter: [] },
      auth,
    );
    expect(experimentResponse.body.filter).toEqual([]);
    await expect(
      prisma.evaluationRule.findUnique({
        where: { id: storedExperimentRule.id },
        select: { targetObject: true, filter: true },
      }),
    ).resolves.toMatchObject({
      targetObject: EvalTargetObject.EVENT,
      filter: [],
    });
  });

  it("matches the existing legacy rule update restrictions", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const legacy = await createLegacyRule(projectId, "legacy patch rule");

    const missing = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluation-rules/${randomUUID()}`,
      { name: "missing rule" },
      auth,
    );
    expect(missing.status).toBe(404);

    const legacyResponse = await makeZodVerifiedAPICall(
      EvaluationRule,
      "PATCH",
      `/api/public/v2/evaluation-rules/${legacy.id}`,
      { enabled: false },
      auth,
    );
    expect(legacyResponse.body).toMatchObject({
      id: legacy.id,
      enabled: false,
    });

    const unsupportedUpdate = await makeAPICall(
      "PATCH",
      `/api/public/v2/evaluation-rules/${legacy.id}`,
      { name: "mutated legacy rule" },
      auth,
    );
    expect(unsupportedUpdate.status).toBe(400);
    await expect(
      prisma.evaluationRule.findUnique({ where: { id: legacy.id } }),
    ).resolves.toMatchObject({
      name: "legacy patch rule",
      status: "INACTIVE",
      targetObject: EvalTargetObject.TRACE,
    });
  });

  it("deletes an evaluation rule", async () => {
    const { auth } = await createOrgProjectAndApiKey();
    const evaluator = await createCodeEvaluator("deleted rule evaluator", auth);
    const rule = await createEvaluationRule({
      name: "deleted rule",
      evaluatorId: evaluator.body.id,
      auth,
    });

    const response = await makeZodVerifiedAPICall(
      DeleteEvaluationRuleResponse,
      "DELETE",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      undefined,
      auth,
    );
    expect(response.body.id).toBe(rule.body.id);

    const get = await makeAPICall(
      "GET",
      `/api/public/v2/evaluation-rules/${rule.body.id}`,
      undefined,
      auth,
    );
    expect(get.status).toBe(404);
  });

  it("deletes legacy rules and returns 404 for missing rules", async () => {
    const { auth, projectId } = await createOrgProjectAndApiKey();
    const legacy = await createLegacyRule(projectId, "legacy delete rule");
    const missing = await makeAPICall(
      "DELETE",
      `/api/public/v2/evaluation-rules/${randomUUID()}`,
      undefined,
      auth,
    );
    expect(missing.status).toBe(404);

    const legacyResponse = await makeZodVerifiedAPICall(
      DeleteEvaluationRuleResponse,
      "DELETE",
      `/api/public/v2/evaluation-rules/${legacy.id}`,
      undefined,
      auth,
    );
    expect(legacyResponse.body.id).toBe(legacy.id);
    await expect(
      prisma.evaluationRule.findUnique({ where: { id: legacy.id } }),
    ).resolves.toBeNull();
  });
});
