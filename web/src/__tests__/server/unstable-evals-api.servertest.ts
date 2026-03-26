/** @jest-environment node */

import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  DeleteUnstableContinuousEvaluationResponse,
  GetUnstableContinuousEvaluationResponse,
  GetUnstableContinuousEvaluationsResponse,
  PatchUnstableContinuousEvaluationResponse,
  PostUnstableContinuousEvaluationResponse,
} from "@/src/features/public-api/types/unstable-continuous-evaluations";
import {
  DeleteUnstableEvaluatorResponse,
  GetUnstableEvaluatorResponse,
  GetUnstableEvaluatorsResponse,
  PatchUnstableEvaluatorResponse,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";
import {
  createNumericEvalOutputDefinition,
  EvalTargetObject,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const __orgIds: string[] = [];

const numericOutputDefinition = createNumericEvalOutputDefinition({
  reasoningDescription: "Why the score was assigned",
  scoreDescription: "A score between 0 and 1",
});

describe("/api/public/unstable evals API", () => {
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const result = await createOrgProjectAndApiKey();
    auth = result.auth;
    projectId = result.projectId;
    __orgIds.push(result.orgId);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: {
          in: __orgIds,
        },
      },
    });
  });

  it("supports evaluator CRUD without exposing version history", async () => {
    const created = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Answer correctness",
        description: "Evaluates answer correctness",
        prompt: "Judge {{input}} against {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    expect(created.body).toMatchObject({
      name: "Answer correctness",
      description: "Evaluates answer correctness",
      type: "llm_as_judge",
      variables: ["input", "output"],
      continuousEvaluationCount: 0,
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorResponse,
      "GET",
      `/api/public/unstable/evaluators/${created.body.id}`,
      undefined,
      auth,
    );

    expect(fetched.body).toMatchObject({
      id: created.body.id,
      name: "Answer correctness",
      prompt: "Judge {{input}} against {{output}}",
    });

    const updated = await makeZodVerifiedAPICall(
      PatchUnstableEvaluatorResponse,
      "PATCH",
      `/api/public/unstable/evaluators/${created.body.id}`,
      {
        name: "Updated answer correctness",
        description: null,
        prompt: "Judge {{input}} and score {{output}}",
      },
      auth,
    );

    expect(updated.body).toMatchObject({
      id: created.body.id,
      name: "Updated answer correctness",
      description: null,
      variables: ["input", "output"],
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorsResponse,
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=50",
      undefined,
      auth,
    );

    expect(listed.body.meta.totalItems).toBe(1);
    expect(listed.body.data[0]).toMatchObject({
      id: created.body.id,
      name: "Updated answer correctness",
    });

    const deleted = await makeZodVerifiedAPICall(
      DeleteUnstableEvaluatorResponse,
      "DELETE",
      `/api/public/unstable/evaluators/${created.body.id}`,
      undefined,
      auth,
    );

    expect(deleted.body).toEqual({
      message: "Evaluator successfully deleted",
    });

    const missing = await makeAPICall(
      "GET",
      `/api/public/unstable/evaluators/${created.body.id}`,
      undefined,
      auth,
    );

    expect(missing.status).toBe(404);
  });

  it("prevents deleting evaluators that are referenced by continuous evaluations", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Groundedness",
        prompt: "Check {{input}} and {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    await makeZodVerifiedAPICall(
      PostUnstableContinuousEvaluationResponse,
      "POST",
      "/api/public/unstable/continuous-evaluations",
      {
        name: "groundedness_score",
        evaluatorId: evaluator.body.id,
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

    const result = await makeAPICall(
      "DELETE",
      `/api/public/unstable/evaluators/${evaluator.body.id}`,
      undefined,
      auth,
    );

    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({
      message:
        "Evaluator cannot be deleted while continuous evaluations still reference it",
    });
  });

  it("supports continuous evaluation CRUD for observation targets", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Answer relevance",
        prompt: "Compare {{input}} and {{output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const created = await makeZodVerifiedAPICall(
      PostUnstableContinuousEvaluationResponse,
      "POST",
      "/api/public/unstable/continuous-evaluations",
      {
        name: "answer_relevance",
        evaluatorId: evaluator.body.id,
        target: "observation",
        enabled: true,
        sampling: 0.5,
        filter: [
          {
            type: "stringOptions",
            column: "type",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
        mapping: [
          { variable: "input", source: "input" },
          { variable: "output", source: "output" },
        ],
      },
      auth,
    );

    expect(created.body).toMatchObject({
      name: "answer_relevance",
      evaluatorId: evaluator.body.id,
      target: "observation",
      enabled: true,
      status: "active",
      sampling: 0.5,
    });

    const stored = await prisma.jobConfiguration.findUnique({
      where: {
        id: created.body.id,
      },
    });

    expect(stored).toMatchObject({
      targetObject: EvalTargetObject.EVENT,
      scoreName: "answer_relevance",
    });

    const fetched = await makeZodVerifiedAPICall(
      GetUnstableContinuousEvaluationResponse,
      "GET",
      `/api/public/unstable/continuous-evaluations/${created.body.id}`,
      undefined,
      auth,
    );

    expect(fetched.body.filter).toEqual([
      {
        type: "stringOptions",
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
      },
    ]);

    const updated = await makeZodVerifiedAPICall(
      PatchUnstableContinuousEvaluationResponse,
      "PATCH",
      `/api/public/unstable/continuous-evaluations/${created.body.id}`,
      {
        enabled: false,
        sampling: 1,
      },
      auth,
    );

    expect(updated.body).toMatchObject({
      id: created.body.id,
      enabled: false,
      status: "inactive",
      sampling: 1,
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableContinuousEvaluationsResponse,
      "GET",
      "/api/public/unstable/continuous-evaluations?page=1&limit=50",
      undefined,
      auth,
    );

    expect(listed.body.meta.totalItems).toBe(1);
    expect(listed.body.data[0]).toMatchObject({
      id: created.body.id,
      name: "answer_relevance",
    });

    const deleted = await makeZodVerifiedAPICall(
      DeleteUnstableContinuousEvaluationResponse,
      "DELETE",
      `/api/public/unstable/continuous-evaluations/${created.body.id}`,
      undefined,
      auth,
    );

    expect(deleted.body).toEqual({
      message: "Continuous evaluation successfully deleted",
    });
  });

  it("allows expected_output mapping only for experiment targets", async () => {
    const evaluator = await makeZodVerifiedAPICall(
      PostUnstableEvaluatorResponse,
      "POST",
      "/api/public/unstable/evaluators",
      {
        name: "Expected output match",
        prompt: "Compare {{output}} to {{expected_output}}",
        outputDefinition: numericOutputDefinition,
      },
      auth,
    );

    const invalidObservation = await makeAPICall(
      "POST",
      "/api/public/unstable/continuous-evaluations",
      {
        name: "expected_output_match",
        evaluatorId: evaluator.body.id,
        target: "observation",
        enabled: true,
        sampling: 1,
        filter: [],
        mapping: [
          { variable: "output", source: "output" },
          { variable: "expected_output", source: "expected_output" },
        ],
      },
      auth,
    );

    expect(invalidObservation.status).toBe(400);
    expect(invalidObservation.body).toMatchObject({
      message:
        'Mapping source "expected_output" is not supported for target "observation"',
    });

    const validExperiment = await makeZodVerifiedAPICall(
      PostUnstableContinuousEvaluationResponse,
      "POST",
      "/api/public/unstable/continuous-evaluations",
      {
        name: "expected_output_match",
        evaluatorId: evaluator.body.id,
        target: "experiment",
        enabled: true,
        sampling: 1,
        filter: [
          {
            type: "stringOptions",
            column: "datasetId",
            operator: "any of",
            value: ["dataset-1"],
          },
        ],
        mapping: [
          { variable: "output", source: "output" },
          { variable: "expected_output", source: "expected_output" },
        ],
      },
      auth,
    );

    expect(validExperiment.body).toMatchObject({
      target: "experiment",
      mapping: [
        { variable: "output", source: "output" },
        { variable: "expected_output", source: "expected_output" },
      ],
      filter: [
        {
          type: "stringOptions",
          column: "datasetId",
          operator: "any of",
          value: ["dataset-1"],
        },
      ],
    });
  });

  it("does not expose internal templates that do not have a public evaluator id", async () => {
    await prisma.evalTemplate.create({
      data: {
        projectId,
        name: "Internal only evaluator",
        version: 1,
        prompt: "Internal {{input}}",
        vars: ["input"],
        outputDefinition: numericOutputDefinition,
      },
    });

    const listed = await makeZodVerifiedAPICall(
      GetUnstableEvaluatorsResponse,
      "GET",
      "/api/public/unstable/evaluators?page=1&limit=50",
      undefined,
      auth,
    );

    expect(listed.body.meta.totalItems).toBe(0);
    expect(listed.body.data).toEqual([]);
  });
});
