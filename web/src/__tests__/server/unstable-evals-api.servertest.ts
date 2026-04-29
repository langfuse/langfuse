import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableEvaluationRuleResponse,
  GetUnstableEvaluationRuleResponse,
  PostUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  GetUnstableEvaluatorResponse,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import { createNumericEvalOutputDefinition } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { ApiKeyScope } from "@prisma/client";
import { UnstablePublicApiErrorResponse } from "@/src/features/public-api/types/unstable-public-evals-contract";
import type { z } from "zod";
import { LLMAdapter } from "@langfuse/shared";
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
    code: z.infer<typeof UnstablePublicApiErrorResponse>["code"];
  },
) => {
  expect(response.status).toBe(params.status);
  const body = UnstablePublicApiErrorResponse.parse(response.body);
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

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    auth = result.auth;
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

  it("creates exact evaluator versions and lists only the latest project version per family", async () => {
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
      },
      auth,
    );

    expect(v1.body).toMatchObject({
      id: expect.any(String),
      name: "Answer correctness",
      version: 1,
      scope: "project",
    });
    expect(v2.body).toMatchObject({
      id: expect.any(String),
      name: "Answer correctness",
      version: 2,
      scope: "project",
    });
    expect(v2.body.id).not.toBe(v1.body.id);

    const fetchedV1 = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${v1.body.id}`,
      undefined,
      auth,
    );
    const fetchedV2 = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${v2.body.id}`,
      undefined,
      auth,
    );

    expect(fetchedV1.body.version).toBe(1);
    expect(fetchedV2.body.version).toBe(2);

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorsResponse,
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=50",
      undefined,
      auth,
    );

    const projectFamilyEntries = listed.body.data.filter(
      (evaluator) =>
        evaluator.name === "Answer correctness" &&
        evaluator.scope === "project",
    );

    expect(projectFamilyEntries).toEqual([
      expect.objectContaining({
        id: v2.body.id,
        name: "Answer correctness",
        version: 2,
        scope: "project",
      }),
    ]);
    expect(
      listed.body.data.some((evaluator) => evaluator.id === v1.body.id),
    ).toBe(false);
  });

  it("automatically moves existing evaluation rules to the newest project evaluator version", async () => {
    await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Faithfulness",
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
        name: "faithfulness-live",
        evaluator: {
          name: "Faithfulness",
          scope: "project",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );

    const v2 = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Faithfulness",
        prompt: "Judge {{input}} versus {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );

    expect(v2.body.version).toBe(2);
    expect(fetched.body.evaluator).toEqual({
      id: v2.body.id,
      name: "Faithfulness",
      scope: "project",
    });
  });

  it("resolves project evaluator families to the latest version when creating an evaluation rule", async () => {
    await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Answer groundedness",
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
        name: "Answer groundedness",
        prompt: "Judge {{input}} versus {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "answer_groundedness_live",
        evaluator: {
          name: "Answer groundedness",
          scope: "project",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );

    expect(created.body.evaluator).toEqual({
      id: v2.body.id,
      name: "Answer groundedness",
      scope: "project",
    });
  });

  it("lists managed and project evaluator families separately when names overlap", async () => {
    const managed = await createManagedEvaluator({
      name: "Groundedness",
      version: 7,
    });

    const projectEvaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Groundedness",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    expect(projectEvaluator.body.version).toBe(1);

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorsResponse,
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=50",
      undefined,
      auth,
    );

    expect(listed.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: managed.id,
          name: "Groundedness",
          version: 7,
          scope: "managed",
        }),
        expect.objectContaining({
          id: projectEvaluator.body.id,
          name: "Groundedness",
          version: 1,
          scope: "project",
        }),
      ]),
    );
  });

  it("allows evaluation rules to reference managed evaluators by exact id", async () => {
    const managed = await createManagedEvaluator({
      name: "Answer relevance",
      version: 3,
    });

    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluationRuleResponse,
      "POST",
      "/api/public/unstable/evaluation-rules",
      {
        name: "answer_relevance_managed",
        evaluator: {
          name: "Answer relevance",
          scope: "managed",
        },
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );

    expect(created.body).toMatchObject({
      evaluator: {
        id: managed.id,
        name: "Answer relevance",
        scope: "managed",
      },
      target: "observation",
      enabled: true,
      status: "active",
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluationRuleResponse,
      "GET",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );

    expect(fetched.body.evaluator).toEqual({
      id: managed.id,
      name: "Answer relevance",
      scope: "managed",
    });

    const deleted = await makeZodVerifiedAPICall(
      DeleteUnstableEvaluationRuleResponse,
      "DELETE",
      `/api/public/unstable/evaluation-rules/${created.body.id}`,
      undefined,
      auth,
    );

    expect(deleted.body.message).toBe("Evaluation rule successfully deleted");
  });

  it("returns method_not_allowed for evaluator patch and delete", async () => {
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
    const deleteRes = await makeAPICall(
      "DELETE",
      `/api/public/unstable/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );

    expectUnstableError(patchRes, {
      status: 405,
      code: "method_not_allowed",
    });
    expectUnstableError(deleteRes, {
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
