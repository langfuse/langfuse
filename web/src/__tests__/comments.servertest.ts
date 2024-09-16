/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  GetCommentsV1Response,
  GetCommentV1Response,
  PostCommentsV1Response,
} from "@/src/features/public-api/types/comments";
import { GetSessionsV1Response } from "@/src/features/public-api/types/sessions";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";

describe("Create and get comments", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create and get comment", async () => {
    await pruneDatabase();

    const traceResponse = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      },
    );

    const { id: traceId } = traceResponse.body;

    const commentResponse = await makeZodVerifiedAPICall(
      PostCommentsV1Response,
      "POST",
      "/api/public/comments",
      {
        content: "hello",
        objectId: traceId,
        objectType: "TRACE",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
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
      objectId: traceId,
      objectType: "TRACE",
      content: "hello",
    });
  });
});

describe("GET /api/public/comments API Endpoint", () => {
  beforeEach(async () => {
    await pruneDatabase();

    const trace = await prisma.trace.create({
      data: {
        id: "trace-2021-01-01",
        createdAt: new Date("2021-01-01T00:00:00Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        name: "trace-1",
      },
    });

    const generation = await prisma.observation.create({
      data: {
        id: "generation-2021-01-01",
        createdAt: new Date("2021-01-01T00:00:00Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        traceId: trace.id,
        name: "generation-1",
        type: "GENERATION",
      },
    });

    await prisma.comment.createMany({
      data: [
        {
          id: "comment-2021-01-01",
          createdAt: new Date("2021-01-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-1",
          objectId: trace.id,
          objectType: "TRACE",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-02-01",
          createdAt: new Date("2021-02-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-2",
          objectId: generation.id,
          objectType: "OBSERVATION",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-03-01",
          createdAt: new Date("2021-03-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-3",
          objectId: trace.id,
          objectType: "TRACE",
          authorUserId: "user-1",
        },
        {
          id: "comment-2021-04-01",
          createdAt: new Date("2021-04-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-4",
          objectId: trace.id,
          objectType: "TRACE",
        },
        {
          id: "comment-2021-05-01",
          createdAt: new Date("2021-05-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          content: "comment-5",
          objectId: trace.id,
          objectType: "TRACE",
        },
      ],
    });
  });
  afterEach(async () => await pruneDatabase());

  it("should return all comments", async () => {
    const comments = await makeZodVerifiedAPICall(
      GetCommentsV1Response,
      "GET",
      "/api/public/comments",
    );
    expect(comments.body.data).toHaveLength(5);
  });

  it("should return comments linked to a specific object and by a specific author", async () => {
    const authorUserId = "user-1";
    const objectId = "trace-2021-01-01";
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

  // it("should return sessions from a specific date onwards (including the date)", async () => {
  //   const fromTimestamp = "2021-03-01T00:00:00Z";

  //   const sessions = await makeZodVerifiedAPICall(
  //     GetSessionsV1Response,
  //     "GET",
  //     `/api/public/sessions?fromTimestamp=${fromTimestamp}`,
  //   );

  //   expect(sessions.body.data).toHaveLength(3);
  //   expect(sessions.body.data.map((session) => session.id)).toEqual([
  //     "session-2021-05-01",
  //     "session-2021-04-01",
  //     "session-2021-03-01",
  //   ]);
  //   expect(sessions.body.meta.totalItems).toBe(3);
  // });
});
