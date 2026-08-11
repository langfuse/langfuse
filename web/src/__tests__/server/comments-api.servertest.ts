import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetCommentsV1Response,
  GetCommentV1Response,
  PatchCommentV1Response,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";
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
    expect.assertions(2); // Ensure that we confirm two things
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
      expect((error as Error).message).toContain(
        `API call did not return 200, returned status 404`,
      );
      expect((error as Error).message).toContain(
        `TRACE: invalid-trace-id not found`,
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

  it("should fail to create comment if content is larger than 5000 characters", async () => {
    try {
      await makeZodVerifiedAPICall(
        z.object({
          message: z.string(),
          error: z.array(z.object({})),
        }),
        "POST",
        "/api/public/comments",
        {
          content: "a".repeat(5001),
          objectId: "1234",
          objectType: "TRACE",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      );
    } catch (error) {
      expect((error as Error).message).toBe(
        `API call did not return 200, returned status 400, body {\"message\":\"Invalid request data\",\"error\":[{\"origin\":\"string\",\"code\":\"too_big\",\"maximum\":5000,\"inclusive\":true,\"path\":[\"content\"],\"message\":\"Too big: expected string to have <=5000 characters\"}]}`,
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

    await prisma.comment.deleteMany({
      where: { projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
    });
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
    expect(comments.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 5,
      totalPages: 1,
    });
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
    expect(comments.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 4,
      totalPages: 1,
    });
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
    expect(comments.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 2,
      totalPages: 1,
    });
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
    expect(comments.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 0,
      totalPages: 0,
    });
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
    expect(comments.body.meta).toMatchObject({
      page: 1,
      limit: 50,
      totalItems: 4,
      totalPages: 1,
    });
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

describe("Public API does NOT process mentions", () => {
  beforeAll(async () => {
    const traces = [
      createTrace({
        name: "trace-for-no-mention-processing",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: "no-mention-processing-trace",
      }),
    ];

    await createTracesCh(traces);
  });

  it("should preserve mention markdown as-is without processing", async () => {
    const commentResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content:
          "Hey @[FakeAdmin](user:user-1) and @[InvalidUser](user:invalid-id), check this!",
        objectId: "no-mention-processing-trace",
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
    // Content should be stored exactly as provided - NO sanitization or normalization
    expect(response.body.content).toBe(
      "Hey @[FakeAdmin](user:user-1) and @[InvalidUser](user:invalid-id), check this!",
    );
  });
});

describe("PATCH /api/public/comments/:commentId", () => {
  beforeAll(async () => {
    const traces = [
      createTrace({
        name: "trace-name",
        project_id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        id: "patch-comment-trace",
      }),
    ];

    await createTracesCh(traces);
  });

  it("should update a comment's content", async () => {
    // Create a comment to update
    const createResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "original content",
        objectId: "patch-comment-trace",
        objectType: "TRACE",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        authorUserId: "user-1",
      },
    );
    const { id: commentId } = createResponse.body;

    const response = await makeZodVerifiedAPICall(
      PatchCommentV1Response,
      "PATCH",
      `/api/public/comments/${commentId}`,
      { content: "updated content" },
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(commentId);
    expect(response.body.content).toBe("updated content");

    // Confirm via GET that the persisted content is the updated value
    const getResponse = await makeZodVerifiedAPICall(
      GetCommentV1Response,
      "GET",
      `/api/public/comments/${commentId}`,
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.content).toBe("updated content");
  });

  it("should return 404 for non-existent comment", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const response = await makeAPICall(
      "PATCH",
      `/api/public/comments/${nonExistentId}`,
      { content: "anything" },
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when patching a comment from a different project", async () => {
    // The default seed project already has comments; create a comment in a
    // DIFFERENT project by spinning up a new org/project/api key.
    const { createOrgProjectAndApiKey } =
      await import("@langfuse/shared/src/server");
    const { auth: otherAuth, projectId: otherProjectId } =
      await createOrgProjectAndApiKey();

    // Create a trace in the OTHER project so the comment has a valid object
    const otherTraces = [
      createTrace({
        name: "other-project-trace",
        project_id: otherProjectId,
        id: "patch-comment-other-trace",
      }),
    ];
    await createTracesCh(otherTraces);

    const createResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "in another project",
        objectId: "patch-comment-other-trace",
        objectType: "TRACE",
        projectId: otherProjectId,
        authorUserId: "user-1",
      },
      otherAuth,
    );
    const { id: otherCommentId } = createResponse.body;

    // Attempt to patch with the SEED project's auth
    const response = await makeAPICall(
      "PATCH",
      `/api/public/comments/${otherCommentId}`,
      { content: "should not work" },
    );

    expect(response.status).toBe(404);
  });

  it("should return 400 when content is empty", async () => {
    // Create a comment to update
    const createResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "original content",
        objectId: "patch-comment-trace",
        objectType: "TRACE",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        authorUserId: "user-1",
      },
    );
    const { id: commentId } = createResponse.body;

    const response = await makeAPICall(
      "PATCH",
      `/api/public/comments/${commentId}`,
      { content: "" },
    );

    expect(response.status).toBe(400);
  });

  it("should return 400 when content exceeds 5000 characters", async () => {
    // Create a comment to update
    const createResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "original content",
        objectId: "patch-comment-trace",
        objectType: "TRACE",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        authorUserId: "user-1",
      },
    );
    const { id: commentId } = createResponse.body;

    const tooLong = "a".repeat(5001);
    const response = await makeAPICall(
      "PATCH",
      `/api/public/comments/${commentId}`,
      { content: tooLong },
    );

    expect(response.status).toBe(400);
  });
});
