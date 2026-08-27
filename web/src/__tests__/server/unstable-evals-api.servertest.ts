import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableEvaluationRuleResponse,
  GetUnstableEvaluationRuleResponse,
  GetUnstableEvaluationRulesResponse,
  PostUnstableEvaluationRuleResponse,
  PatchUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  DeleteUnstableEvaluatorResponse,
  GetUnstableEvaluatorResponse,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import {
  createNumericEvalOutputDefinition,
  LLMAdapter,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { ApiKeyScope } from "@prisma/client";
import { StructuredPublicApiErrorResponse } from "@/src/features/public-api/types/unstable-public-evals-contract";
import type { z } from "zod";
import { encrypt } from "@langfuse/shared/encryption";

const __orgIds: string[] = [];
const __managedTemplateIds: string[] = [];

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

const provisionDefaultEvalModel = async (projectId: string) => {
  const provider = `openai-${projectId}`;

  const llmApiKey = await prisma.llmApiKeys.create({
    data: {
      projectId,
      provider,
      adapter: LLMAdapter.OpenAI,
      secretKey: encrypt("sk-test"),
      displaySecretKey: "...test",
      baseURL: "https://api.openai.com/v1",
      customModels: [],
      withDefaultModels: true,
      extraHeaders: null,
      extraHeaderKeys: [],
    },
  });

  await prisma.defaultLlmModel.create({
    data: {
      projectId,
      llmApiKeyId: llmApiKey.id,
      provider,
      adapter: LLMAdapter.OpenAI,
      model: "gpt-4.1-mini",
    },
  });
};

const expectUnstableError = (
  response: Awaited<ReturnType<typeof makeAPICall>>,
  params: {
    status: number;
    code: z.infer<typeof StructuredPublicApiErrorResponse>["code"];
  },
) => {
  expect(response.status).toBe(params.status);
  const body = StructuredPublicApiErrorResponse.parse(response.body);
  expect(body.code).toBe(params.code);
  return body;
};

const createManagedEvaluator = async (params: {
  name: string;
  version: number;
  prompt?: string;
}) => {
  const template = await prisma.evalTemplate.create({
    data: {
      projectId: null,
      name: params.name,
      version: params.version,
      prompt: params.prompt ?? "Judge {{input}} against {{output}}",
      partner: "ragas",
      vars: ["input", "output"],
      outputDefinition: numericOutputDefinition,
    },
  });

  __managedTemplateIds.push(template.id);
  return template;
};

describe("/api/public/unstable evaluators API", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    auth = result.auth;
    projectId = result.projectId;
    __orgIds.push(result.orgId);
    await provisionDefaultEvalModel(result.projectId);
  });

  afterAll(async () => {
    await prisma.jobConfiguration.deleteMany({
      where: {
        evalTemplateId: {
          in: __managedTemplateIds,
        },
      },
    });
    await prisma.evalTemplate.deleteMany({
      where: {
        id: {
          in: __managedTemplateIds,
        },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: {
          in: __orgIds,
        },
      },
    });
  });

  it("keeps one evaluator id across versions and returns only the latest version", async () => {
    const v1 = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Answer correctness",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const v2 = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Answer correctness",
        prompt: "Judge {{input}} versus {{output}}",
        outputDefinition: numericOutputDefinition,
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );

    expect(v1.body).toMatchObject({
      id: expect.any(String),
      name: "Answer correctness",
      version: 1,
    });
    expect(v2.body).toMatchObject({
      id: expect.any(String),
      name: "Answer correctness",
      version: 2,
    });
    expect(v2.body.id).toBe(v1.body.id);

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${v1.body.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toMatchObject({
      id: v1.body.id,
      version: 2,
      mapping: [
        { variable: "input", source: "input" },
        { variable: "output", source: "output" },
      ],
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorsResponse,
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=50",
      undefined,
      auth,
    );

    const projectFamilyEntries = listed.body.data.filter(
      (evaluator) => evaluator.name === "Answer correctness",
    );

    expect(projectFamilyEntries).toEqual([
      expect.objectContaining({
        id: v2.body.id,
        name: "Answer correctness",
        version: 2,
      }),
    ]);
    expect(listed.body.data).toContainEqual(
      expect.objectContaining({ id: v1.body.id, version: 2 }),
    );
  });

  it("deletes an evaluator including all of its versions by evaluator id", async () => {
    const v1 = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Deletable correctness",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const v2 = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Deletable correctness",
        prompt: "Judge {{input}} versus {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    expect(v2.body.id).toBe(v1.body.id);
    const deleted = await makeZodVerifiedAPICall(
      DeleteUnstableEvaluatorResponse,
      "DELETE",
      `/api/public/unstable/evaluators/${v1.body.id}`,
      undefined,
      auth,
    );
    expect(deleted.body.message).toBe("Evaluator successfully deleted");

    const fetchLatest = await makeAPICall(
      "GET",
      `/api/public/unstable/evaluators/${v2.body.id}`,
      undefined,
      auth,
    );
    expectUnstableError(fetchLatest, {
      status: 404,
      code: "resource_not_found",
    });
  });

  it("returns 404 when deleting an unknown evaluator", async () => {
    const response = await makeAPICall(
      "DELETE",
      "/api/public/unstable/evaluators/unknown-evaluator-id",
      undefined,
      auth,
    );
    expectUnstableError(response, {
      status: 404,
      code: "resource_not_found",
    });
  });

  it("does not resolve evaluators from legacy managed templates", async () => {
    await createManagedEvaluator({
      name: "Answer relevance",
      version: 3,
    });

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "answer_relevance_managed",
        evaluator: {
          name: "Answer relevance",
        },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );
    expectUnstableError(response, {
      status: 404,
      code: "resource_not_found",
    });
  });

  it("rejects unsupported filters without creating a rule", async () => {
    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "unsupported_filter_rule",
        evaluator: { name: "unused", type: "llm_as_judge" },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [
          {
            column: "totalCost",
            type: "number",
            operator: ">",
            value: 0.01,
          },
        ],
      },
      auth,
    );

    expectUnstableError(response, { status: 400, code: "invalid_body" });
    await expect(
      prisma.evaluationRule.count({ where: { projectId } }),
    ).resolves.toBe(0);
  });

  it("uses public project evaluators in observation rules without changing the API contract", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Public project evaluator",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "public_project_rule",
        evaluator: {
          name: evaluator.body.name,
          type: "llm_as_judge",
        },
        target: "observation",
        enabled: false,
        sampling: 0.5,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );
    expect(created.body).toMatchObject({
      name: "public_project_rule",
      evaluator: { id: evaluator.body.id },
      target: "observation",
      enabled: false,
      sampling: 0.5,
    });

    await expect(
      prisma.evaluationRule.findUniqueOrThrow({
        where: { id: created.body.id },
        include: { assignments: true },
      }),
    ).resolves.toMatchObject({
      assignments: [{ evaluatorId: evaluator.body.id }],
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toEqual(created.body);

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRulesResponse,
      "GET",
      "/api/public/unstable/evaluation-rules?page=1&limit=50",
      undefined,
      auth,
    );
    expect(listed.body.data).toContainEqual(created.body);

    const updated = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      { name: "public_project_rule_updated", enabled: false },
      auth,
    );
    expect(updated.body).toMatchObject({
      id: created.body.id,
      name: "public_project_rule_updated",
      enabled: false,
      status: "inactive",
      evaluator: { id: evaluator.body.id },
    });

    const deleted = await makeZodVerifiedAPICall(
      DeleteUnstableEvaluationRuleResponse,
      "DELETE",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );
    expect(deleted.body.message).toBe("Evaluation rule successfully deleted");
    await expect(
      prisma.evaluationRule.findUnique({ where: { id: created.body.id } }),
    ).resolves.toBeNull();
  });

  it("returns incomplete inherited legacy mappings from create and read endpoints", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Legacy mapping evaluator",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );
    await prisma.evaluatorVersion.updateMany({
      where: { evaluatorId: evaluator.body.id },
      data: {
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
            langfuseObject: "trace",
            objectName: null,
            selectedColumnId: "output",
            jsonSelector: null,
          },
        ],
      },
    });

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "incomplete_inherited_mapping_rule",
        evaluator: { name: evaluator.body.name },
        target: "observation",
        enabled: false,
        sampling: 1,
        filter: [],
      },
      auth,
    );
    const incompleteMapping = [
      { variable: "input", source: null },
      { variable: "output", source: null },
    ];
    expect(created.body).toMatchObject({
      mapping: incompleteMapping,
      evaluators: [{ mapping: incompleteMapping }],
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toEqual(created.body);

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRulesResponse,
      "GET",
      "/api/public/unstable/evaluation-rules?page=1&limit=50",
      undefined,
      auth,
    );
    expect(listed.body.data).toContainEqual(created.body);
  });

  it("creates and returns multiple evaluator assignments with compatibility aliases", async () => {
    const createEvaluator = (name: string) =>
      makeZodVerifiedAPICall(
        PostUnstableEvaluatorResponse,
        "POST",
        "/api/public/unstable/evaluators",
        {
          name,
          prompt: "Judge {{input}}",
          outputDefinition: numericOutputDefinition,
          mapping: [{ variable: "input", source: "input" }],
        },
        auth,
      );
    const [correctness, tone] = await Promise.all([
      createEvaluator("Multi-rule correctness"),
      createEvaluator("Multi-rule tone"),
    ]);

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "multi_evaluator_rule",
        evaluators: [
          {
            evaluator: {
              name: correctness.body.name,
              type: "llm_as_judge",
            },
          },
          {
            evaluator: {
              name: tone.body.name,
              type: "llm_as_judge",
            },
            mapping: [{ variable: "input", source: "output" }],
          },
        ],
        target: "observation",
        enabled: false,
        filter: [],
      },
      auth,
    );

    expect(created.body).toMatchObject({
      evaluator: { id: correctness.body.id },
      mapping: [{ variable: "input", source: "input" }],
      evaluators: [
        { evaluator: { id: correctness.body.id }, mapping: null },
        {
          evaluator: { id: tone.body.id },
          mapping: [{ variable: "input", source: "output" }],
        },
      ],
    });

    const updated = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      { name: "multi_evaluator_rule_updated" },
      auth,
    );
    expect(updated.body.evaluators).toHaveLength(2);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: created.body.id },
      }),
    ).resolves.toBe(2);
  });

  it("replaces the whole assignment set through evaluators on patch", async () => {
    const createEvaluator = (name: string) =>
      makeZodVerifiedAPICall(
        PostUnstableEvaluatorResponse,
        "POST",
        "/api/public/unstable/evaluators",
        {
          name,
          prompt: "Judge {{input}}",
          outputDefinition: numericOutputDefinition,
          mapping: [{ variable: "input", source: "input" }],
        },
        auth,
      );
    const [first, second, third] = await Promise.all([
      createEvaluator("Patch set first"),
      createEvaluator("Patch set second"),
      createEvaluator("Patch set third"),
    ]);

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "patch_evaluator_set_rule",
        evaluators: [
          { evaluator: { name: first.body.name, type: "llm_as_judge" } },
          { evaluator: { name: second.body.name, type: "llm_as_judge" } },
        ],
        target: "observation",
        enabled: false,
        filter: [],
      },
      auth,
    );

    // Drops `second`, keeps `first`, attaches `third` with an override.
    const updated = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      {
        evaluators: [
          { evaluator: { name: first.body.name, type: "llm_as_judge" } },
          {
            evaluator: { name: third.body.name, type: "llm_as_judge" },
            mapping: [{ variable: "input", source: "output" }],
          },
        ],
      },
      auth,
    );

    expect(updated.body.evaluators).toEqual([
      expect.objectContaining({
        evaluator: expect.objectContaining({ id: first.body.id }),
        mapping: null,
      }),
      expect.objectContaining({
        evaluator: expect.objectContaining({ id: third.body.id }),
        mapping: [{ variable: "input", source: "output" }],
      }),
    ]);
    await expect(
      prisma.evaluationRuleEvaluatorAssignment.count({
        where: { evaluationRuleId: created.body.id },
      }),
    ).resolves.toBe(2);
  });

  it("keeps a rule readable and deletable after its last evaluator is detached", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Detached rule evaluator",
        prompt: "Judge {{input}}",
        outputDefinition: numericOutputDefinition,
        mapping: [{ variable: "input", source: "input" }],
      },
      auth,
    );
    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "detached_assignments_rule",
        evaluator: { name: evaluator.body.name, type: "llm_as_judge" },
        target: "observation",
        enabled: false,
        filter: [],
      },
      auth,
    );

    // Mirrors detaching the last evaluator from the app or MCP tools.
    await prisma.evaluationRuleEvaluatorAssignment.deleteMany({
      where: { evaluationRuleId: created.body.id },
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toMatchObject({
      id: created.body.id,
      evaluator: null,
      evaluators: [],
      mapping: [],
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRulesResponse,
      "GET",
      "/api/public/unstable/evaluation-rules?page=1&limit=50",
      undefined,
      auth,
    );
    expect(listed.body.data.map((rule) => rule.id)).toContain(created.body.id);

    const deleted = await makeAPICall(
      "DELETE",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );
    expect(deleted.status).toBe(200);
  });

  it("rejects create bodies that combine evaluators with the deprecated mapping alias", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Conflicting alias evaluator",
        prompt: "Judge {{input}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const response = await makeAPICall(
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "conflicting_alias_rule",
        evaluators: [
          { evaluator: { name: evaluator.body.name, type: "llm_as_judge" } },
        ],
        mapping: [{ variable: "input", source: "input" }],
        target: "observation",
        enabled: false,
        filter: [],
      },
      auth,
    );
    expect(response.status).toBe(400);
  });

  it("stores experiment rules and evaluator usage in the new tables", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Project experiment evaluator",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "project_experiment_rule",
        evaluator: {
          name: evaluator.body.name,
          type: "llm_as_judge",
        },
        target: "experiment",
        enabled: false,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );
    expect(created.body).toMatchObject({
      evaluator: { id: evaluator.body.id },
      target: "experiment",
      enabled: false,
    });
    await expect(
      prisma.evaluationRule.findUniqueOrThrow({
        where: { id: created.body.id },
        include: { assignments: true },
      }),
    ).resolves.toMatchObject({
      targetObject: "event",
      filter: [
        {
          column: "isExperimentItemRootSpan",
          operator: "=",
          value: true,
        },
      ],
      assignments: [{ evaluatorId: evaluator.body.id }],
    });
    await expect(
      prisma.jobConfiguration.findUnique({ where: { id: created.body.id } }),
    ).resolves.toBeNull();

    const observationRule = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      { target: "observation" },
      auth,
    );
    expect(observationRule.body).toMatchObject({ target: "observation" });
    await expect(
      prisma.evaluationRule.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).resolves.toMatchObject({ targetObject: "event", filter: [] });

    const experimentRule = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      { target: "experiment" },
      auth,
    );
    expect(experimentRule.body).toMatchObject({ target: "experiment" });
    await expect(
      prisma.evaluationRule.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).resolves.toMatchObject({
      targetObject: "event",
      filter: [
        {
          column: "isExperimentItemRootSpan",
          operator: "=",
          value: true,
        },
      ],
    });

    // An experiment rule is an observation rule scoped to experiment root
    // spans, so observation filters survive the round trip alongside the
    // implicit root filter rather than failing the experiment filter schema.
    const scopedExperimentRule = await makeZodVerifiedAPICall(
      PatchUnstableEvaluationRuleResponse,
      "PATCH",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      {
        target: "experiment",
        filter: [
          {
            type: "stringOptions",
            column: "environment",
            operator: "any of",
            value: ["production"],
          },
        ],
      },
      auth,
    );
    expect(scopedExperimentRule.body).toMatchObject({
      target: "experiment",
      filter: [{ column: "environment", value: ["production"] }],
    });
    await expect(
      prisma.evaluationRule.findUniqueOrThrow({
        where: { id: created.body.id },
      }),
    ).resolves.toMatchObject({
      targetObject: "event",
      filter: [
        { column: "environment" },
        { column: "isExperimentItemRootSpan", operator: "=", value: true },
      ],
    });

    const fetchedEvaluator = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );
    expect(fetchedEvaluator.body.evaluationRuleCount).toBe(1);

    await makeZodVerifiedAPICall(
      DeleteUnstableEvaluatorResponse,
      "DELETE",
      `/api/public/unstable/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );
    await expect(
      prisma.evaluationRule.findUnique({
        where: { id: created.body.id },
        include: { assignments: true },
      }),
    ).resolves.toMatchObject({ id: created.body.id, assignments: [] });
  });

  it("reads native trace and dataset rules but keeps them read-only", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Project trace evaluator",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );
    const mapping = [
      {
        variable: "input",
        langfuseObject: "trace",
        objectName: null,
        source: "input",
      },
      {
        variable: "output",
        langfuseObject: "generation",
        objectName: "answer-generation",
        source: "output",
        jsonPath: "$.answer",
      },
    ];

    const nativeRule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "project_trace_rule",
        targetObject: "trace",
        status: "ACTIVE",
        sampling: 0.5,
        delay: 250,
        timeScope: ["NEW"],
        filter: [],
        assignments: {
          create: {
            projectId,
            evaluatorId: evaluator.body.id,
            variableMapping: mapping.map((item) => ({
              templateVariable: item.variable,
              langfuseObject: item.langfuseObject,
              objectName: item.objectName,
              selectedColumnId: item.source,
              jsonSelector: item.jsonPath ?? null,
            })),
          },
        },
      },
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${nativeRule.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toMatchObject({
      id: nativeRule.id,
      name: "project_trace_rule",
      evaluator: { id: evaluator.body.id },
      target: "trace",
      enabled: true,
      sampling: 0.5,
      delay: 250,
      timeScope: ["NEW"],
      mapping,
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRulesResponse,
      "GET",
      "/api/public/unstable/evaluation-rules?page=1&limit=50",
      undefined,
      auth,
    );
    expect(listed.body.data).toContainEqual(fetched.body);

    const createResponse = await makeAPICall(
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "new_trace_rule",
        evaluator: {
          name: evaluator.body.name,
          type: "llm_as_judge",
        },
        target: "trace",
        enabled: false,
        filter: [],
        mapping,
      },
      auth,
    );
    expectUnstableError(createResponse, { status: 400, code: "invalid_body" });

    const updateResponse = await makeAPICall(
      "PATCH",
      `/api/public/unstable/evaluation-rules/${nativeRule.id}`,
      { name: "project_trace_rule_updated", enabled: false },
      auth,
    );
    expectUnstableError(updateResponse, {
      status: 404,
      code: "resource_not_found",
    });

    const deleteResponse = await makeAPICall(
      "DELETE",
      `/api/public/unstable/evaluation-rules/${nativeRule.id}`,
      undefined,
      auth,
    );
    expectUnstableError(deleteResponse, {
      status: 404,
      code: "resource_not_found",
    });

    const nativeDatasetRule = await prisma.evaluationRule.create({
      data: {
        projectId,
        name: "project_dataset_rule",
        targetObject: "dataset",
        status: "INACTIVE",
        sampling: 1,
        delay: 0,
        timeScope: ["EXISTING"],
        filter: [],
        assignments: {
          create: {
            projectId,
            evaluatorId: evaluator.body.id,
            variableMapping: mapping.map((item) => ({
              templateVariable: item.variable,
              langfuseObject: "dataset_item",
              objectName: null,
              selectedColumnId: item.source,
              jsonSelector: item.jsonPath ?? null,
            })),
          },
        },
      },
    });
    const fetchedDatasetRule = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${nativeDatasetRule.id}`,
      undefined,
      auth,
    );
    expect(fetchedDatasetRule.body).toMatchObject({
      id: nativeDatasetRule.id,
      target: "dataset",
      enabled: false,
      timeScope: ["EXISTING"],
      mapping: [
        expect.objectContaining({ langfuseObject: "dataset_item" }),
        expect.objectContaining({ langfuseObject: "dataset_item" }),
      ],
    });
  });

  it("returns method_not_allowed for evaluator patch", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Correctness",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const patchRes = await makeAPICall(
      "PATCH",
      `/api/public/unstable/evaluators/${evaluator.body.id}`,
      {
        prompt: "Updated",
      },
      auth,
    );

    expectUnstableError(patchRes, {
      status: 405,
      code: "method_not_allowed",
    });
  });

  it("still rejects invalid auth with the unstable error envelope", async () => {
    const result = await createOrgProjectAndApiKey();
    __orgIds.push(result.orgId);
    const orgApiKey = await createAndAddApiKeysToDb({
      prisma,
      entityId: result.orgId,
      scope: ApiKeyScope.ORGANIZATION,
    });

    const response = await makeAPICall(
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=10",
      undefined,
      createBasicAuthHeader(orgApiKey.publicKey, orgApiKey.secretKey),
    );

    expectUnstableError(response, {
      status: 403,
      code: "access_denied",
    });
  });
});
