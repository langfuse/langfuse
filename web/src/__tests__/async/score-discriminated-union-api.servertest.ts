import {
  createTraceScore,
  createSessionScore,
  createDatasetRunScore,
} from "@langfuse/shared/src/server";
import {
  createScoresCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetScoreResponseV2, GetScoresResponseV2 } from "@langfuse/shared";
import { v4 } from "uuid";

describe("Score Discriminated Union API Tests", () => {
  describe("GET /api/public/v2/scores/:scoreId - Discriminated Union Validation", () => {
    it("should return NUMERIC score with correct discriminated union structure", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "accuracy",
        value: 0.95,
        source: "API",
        data_type: "NUMERIC",
        string_value: null,
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: scoreId,
        dataType: "NUMERIC",
        value: 0.95,
        stringValue: null,
      });
    });

    it("should return CATEGORICAL score with correct discriminated union structure", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "quality",
        value: 1,
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
        string_value: "excellent",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: scoreId,
        dataType: "CATEGORICAL",
        stringValue: "excellent",
      });
    });

    it("should return BOOLEAN score with correct discriminated union structure", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "passed",
        value: 1,
        source: "EVAL",
        data_type: "BOOLEAN",
        string_value: "true",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: scoreId,
        dataType: "BOOLEAN",
        value: 1,
        stringValue: "true",
      });
    });

    it("should return NUMERIC score with null value", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "optional_metric",
        value: null,
        source: "API",
        data_type: "NUMERIC",
        string_value: null,
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: scoreId,
        dataType: "NUMERIC",
        value: null,
      });
    });
  });

  describe("GET /api/public/v2/scores - List with Different Data Types", () => {
    it("should list scores with mixed data types maintaining discriminated union", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const traceId = v4();
      const numericScore = createTraceScore({
        id: v4(),
        project_id: projectId,
        trace_id: traceId,
        name: "numeric_score",
        value: 0.85,
        source: "API",
        data_type: "NUMERIC",
        string_value: null,
      });

      const categoricalScore = createTraceScore({
        id: v4(),
        project_id: projectId,
        trace_id: traceId,
        name: "categorical_score",
        value: 2,
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
        string_value: "good",
      });

      const booleanScore = createTraceScore({
        id: v4(),
        project_id: projectId,
        trace_id: traceId,
        name: "boolean_score",
        value: 0,
        source: "EVAL",
        data_type: "BOOLEAN",
        string_value: "false",
      });

      await createScoresCh([numericScore, categoricalScore, booleanScore]);

      const response = await makeZodVerifiedAPICall(
        GetScoresResponseV2,
        "GET",
        "/api/public/v2/scores",
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);

      const scores = response.body.data;

      // Find each score by name and verify structure
      const numericResult = scores.find((s) => s.name === "numeric_score");
      expect(numericResult).toMatchObject({
        dataType: "NUMERIC",
        value: 0.85,
        stringValue: null,
      });

      const categoricalResult = scores.find(
        (s) => s.name === "categorical_score",
      );
      expect(categoricalResult).toMatchObject({
        dataType: "CATEGORICAL",
        stringValue: "good",
      });

      const booleanResult = scores.find((s) => s.name === "boolean_score");
      expect(booleanResult).toMatchObject({
        dataType: "BOOLEAN",
        value: 0,
        stringValue: "false",
      });
    });
  });

  describe("Score Types for Different Entities", () => {
    it("should handle trace-level NUMERIC score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        observation_id: null,
        name: "trace_accuracy",
        value: 0.92,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        dataType: "NUMERIC",
        value: 0.92,
        traceId: score.trace_id,
        observationId: null,
      });
    });

    it("should handle observation-level CATEGORICAL score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        observation_id: v4(),
        name: "observation_quality",
        value: 1,
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
        string_value: "excellent",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        dataType: "CATEGORICAL",
        stringValue: "excellent",
        traceId: score.trace_id,
        observationId: score.observation_id,
      });
    });

    it("should handle session-level BOOLEAN score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createSessionScore({
        id: scoreId,
        project_id: projectId,
        session_id: v4(),
        name: "session_passed",
        value: 1,
        source: "EVAL",
        data_type: "BOOLEAN",
        string_value: "true",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        dataType: "BOOLEAN",
        value: 1,
        stringValue: "true",
        sessionId: score.session_id,
        traceId: null,
      });
    });

    it("should handle dataset run NUMERIC score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createDatasetRunScore({
        id: scoreId,
        project_id: projectId,
        dataset_run_id: v4(),
        name: "run_metric",
        value: 0.88,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        dataType: "NUMERIC",
        value: 0.88,
        datasetRunId: score.dataset_run_id,
      });
    });
  });

  describe("Score Sources with Data Types", () => {
    it("should handle API source with NUMERIC score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "api_score",
        value: 100,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        source: "API",
        dataType: "NUMERIC",
        value: 100,
      });
    });

    it("should handle EVAL source with CATEGORICAL score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "eval_score",
        value: 1,
        source: "EVAL",
        data_type: "CATEGORICAL",
        string_value: "pass",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        source: "EVAL",
        dataType: "CATEGORICAL",
        stringValue: "pass",
      });
    });

    it("should handle ANNOTATION source with BOOLEAN score", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "annotation_score",
        value: 0,
        source: "ANNOTATION",
        data_type: "BOOLEAN",
        string_value: "false",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        source: "ANNOTATION",
        dataType: "BOOLEAN",
        value: 0,
        stringValue: "false",
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle NUMERIC score with negative value", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "negative_score",
        value: -50,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.value).toBe(-50);
    });

    it("should handle NUMERIC score with very precise decimal", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "precise_score",
        value: 0.123456789,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.value).toBeCloseTo(0.123456789, 9);
    });

    it("should handle CATEGORICAL score with empty string", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "empty_category",
        value: 0,
        source: "API",
        data_type: "CATEGORICAL",
        string_value: "",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.stringValue).toBe("");
    });

    it("should handle CATEGORICAL score with multi-word value", async () => {
      const { projectId, auth } = await createOrgProjectAndApiKey();

      const scoreId = v4();
      const score = createTraceScore({
        id: scoreId,
        project_id: projectId,
        trace_id: v4(),
        name: "multi_word_category",
        value: 1,
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
        string_value: "needs improvement",
      });

      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetScoreResponseV2,
        "GET",
        `/api/public/v2/scores/${scoreId}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.stringValue).toBe("needs improvement");
    });
  });
});
