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
  DeleteUnstableEvaluatorResponse,
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
    expect(v2.body.id).toBe(v1.body.id);

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${v1.body.id}`,
      undefined,
      auth,
    );
    expect(fetched.body).toMatchObject({ id: v1.body.id, version: 2 });

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

    const storedRule = await prisma.jobConfiguration.findUniqueOrThrow({
      where: { id: created.body.id },
      select: { projectId: true },
    });
    const execution = await prisma.jobExecution.create({
      data: {
        projectId: storedRule.projectId,
        jobConfigurationId: created.body.id,
        status: "PENDING",
      },
    });

    expect(fetched.body.evaluator).toEqual({
      id: managed.id,
      name: "Answer relevance",
      scope: "managed",
      type: "llm_as_judge",
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
      prisma.jobExecution.findUnique({ where: { id: execution.id } }),
    ).resolves.toBeNull();
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
