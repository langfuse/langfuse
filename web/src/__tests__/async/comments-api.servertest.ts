/** @jest-environment node */

import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import {
  GetCommentsV1Response,
  GetCommentV1Response,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  createObservationsCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { createObservation, createTrace } from "@langfuse/shared/src/server";

describe("Create and get comments", () => {
  beforeAll(async () => {
    const traces = [
      createTrace({
        name: "trace-name",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: "1234",
      }),
    ];

    await createTracesCh(traces);
  });

  it("should create and get comment", async () => {
    const commentResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "hello",
        objectId: "1234",
        objectType: "TRACE",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        authorUserId: "user-1",
      },
    );

    const { id: commentId } = commentResponse.body;

    const response = await makeZodVerifiedAPICall(
      GetCommentV1Response,
      "GET",
      `/api/public/comments/${commentId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: commentId,
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      objectId: "1234",
      objectType: "TRACE",
      content: "hello",
      authorUserId: "user-1",
    });
  });

  it("should fail to create comment if reference object does not exist", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "POST",
        "/api/public/comments",
        {
          content: "hello",
          objectId: "invalid-trace-id",
          objectType: "TRACE",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 404, body {\"message\":\"Reference object, TRACE: invalid-trace-id not found in Clickhouse. Skipping creating comment.\",\"error\":\"LangfuseNotFoundError\"}`,
      );
    }
  });

  it("should fail to create comment if content is empty", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "POST",
        "/api/public/comments",
        {
          content: "",
          objectId: "1234",
          objectType: "TRACE",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":1,\"inclusive\":true,\"path\":[\"content\"],\"message\":\"Too small: expected string to have >=1 characters\"}]}`,
      );
    }
  });

  it("should fail to create comment if content is larger than 3000 characters", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "POST",
        "/api/public/comments",
        {
          content: "a".repeat(3001),
          objectId: "1234",
          objectType: "TRACE",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":3000,\"inclusive\":true,\"path\":[\"content\"],\"message\":\"Too big: expected string to have <=3000 characters\"}]}`,
      );
    }
  });
});

describe("GET /api/public/comments API Endpoint", () => {
  beforeAll(async () => {
    const traces = [
      createTrace({
        name: "trace-1",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: "1234",
      }),
    ];

    await createTracesCh(traces);

    const observation = createObservation({
      name: "generation-1",
      project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      id: "5678",
      type: "GENERATION",
      trace_id: "1234",
    });

    await createObservationsCh([observation]);

    await prisma.comment.deleteMany();
    await prisma.comment.createMany({
      data: [
        {
          id: "comment-2021-01-01",
          createdAt: new Date("2021-01-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-1",
          objectId: "1234",
          objectType: "TRACE",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-02-01",
          createdAt: new Date("2021-02-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-2",
          objectId: "5678",
          objectType: "OBSERVATION",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-03-01",
          createdAt: new Date("2021-03-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-3",
          objectId: "1234",
          objectType: "TRACE",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-04-01",
          createdAt: new Date("2021-04-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-4",
          objectId: "1234",
          objectType: "TRACE",
        },
        {
          id: "comment-2021-05-01",
          createdAt: new Date("2021-05-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-5",
          objectId: "1234",
          objectType: "TRACE",
        },
      ],
    });
  });

  it("should return all comments", async () => {
    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      "/api/public/comments",
    );
    expect(comments.body.data).toHaveLength(5);
  });

  it("should return comments for a specific objectId and objectType", async () => {
    const objectId = "1234";
    const objectType = "TRACE";

    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      `/api/public/comments?objectType=${objectType}&objectId=${objectId}`,
    );

    expect(comments.body.data).toHaveLength(4);
    expect(comments.body.data.map((comment) => comment.id)).toEqual([
      "comment-2021-01-01",
      "comment-2021-03-01",
      "comment-2021-04-01",
      "comment-2021-05-01",
    ]);
  });

  it("should return comments linked to a specific object and by a specific author", async () => {
    const authorUserId = "user-1";
    const objectId = "1234";
    const objectType = "TRACE";

    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      `/api/public/comments?objectType=${objectType}&objectId=${objectId}&authorUserId=${authorUserId}`,
    );

    expect(comments.body.data).toHaveLength(2);
    expect(comments.body.data.map((comment) => comment.id)).toEqual([
      "comment-2021-01-01",
      "comment-2021-03-01",
    ]);
  });

  it("should return an empty array when no comments match the criteria", async () => {
    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      "/api/public/comments?authorUserId=non-existent-user",
    );

    expect(comments.body.data).toHaveLength(0);
  });

  it("should throw 400 error with descriptive error message if objectType is provided but invalid", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "GET",
        "/api/public/comments?objectType=INVALID_TYPE",
      );
    } catch (error) {
      expect((error as Error).message).toContain(
        "API call did not return 200, returned status 400",
      );
    }
  });

  it("should return all trace comments if objectType is provided and objectId is not", async () => {
    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      "/api/public/comments?objectType=TRACE",
    );
    expect(comments.body.data).toHaveLength(4);
    expect(comments.body.data.map((comment) => comment.id)).toEqual([
      "comment-2021-01-01",
      "comment-2021-03-01",
      "comment-2021-04-01",
      "comment-2021-05-01",
    ]);
  });

  it("should throw 400 error with descriptive error message if objectId is provided but objectType is not", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "GET",
        "/api/public/comments?objectId=trace-2021-01-01",
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"code\":\"custom\",\"path\":[\"objectType\"],\"message\":\"objectType is required when objectId is provided\"}]}`,
      );
    }
  });
});
