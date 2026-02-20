/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import {
  CreateAnnotationQueueAssignmentResponse,
  DeleteAnnotationQueueAssignmentResponse,
} from "@/src/features/public-api/types/annotation-queues";

describe("/api/public/annotation-queues/:queueId/assignments API", () => {
  let auth: string;
  let projectId: string;
  let orgId: string;
  let queueId: string;
  let testUserId: string;
  let secondTestUserId: string;

  beforeEach(async () => {
    const {
      auth: newAuth,
      projectId: newProjectId,
      orgId: newOrgId,
    } = await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
    orgId = newOrgId;

    // Create a test annotation queue
    const queue = await prisma.annotationQueue.create({
      data: {
        id: uuidv4(),
        name: "Test Queue for Assignments",
        description: "Test queue for assignment testing",
        projectId,
        scoreConfigIds: [],
      },
    });
    queueId = queue.id;

    // Create test users with project access
    const testUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `testuser1-${uuidv4()}@example.com`,
        name: "Test User 1",
      },
    });
    testUserId = testUser.id;

    const secondTestUser = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `testuser2-${uuidv4()}@example.com`,
        name: "Test User 2",
      },
    });
    secondTestUserId = secondTestUser.id;

    // Give users project access - need to create org memberships first
    await prisma.organizationMembership.createMany({
      data: [
        {
          orgId,
          userId: testUserId,
          role: "MEMBER",
        },
        {
          orgId,
          userId: secondTestUserId,
          role: "MEMBER",
        },
      ],
    });

    // Get the org membership IDs and create project memberships
    const orgMembership1 = await prisma.organizationMembership.findFirst({
      where: { orgId, userId: testUserId },
    });
    const orgMembership2 = await prisma.organizationMembership.findFirst({
      where: { orgId, userId: secondTestUserId },
    });

    await prisma.projectMembership.createMany({
      data: [
        {
          projectId,
          userId: testUserId,
          role: "MEMBER",
          orgMembershipId: orgMembership1!.id,
        },
        {
          projectId,
          userId: secondTestUserId,
          role: "MEMBER",
          orgMembershipId: orgMembership2!.id,
        },
      ],
    });
  });

  describe("POST /api/public/annotation-queues/:queueId/assignments", () => {
    it("should create annotation queue assignment successfully", async () => {
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueAssignmentResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(testUserId);
      expect(response.body.projectId).toBe(projectId);
      expect(response.body.queueId).toBe(queueId);

      // Verify the membership was created in the database
      const assignment = await prisma.annotationQueueAssignment.findUnique({
        where: {
          projectId_queueId_userId: {
            projectId,
            queueId,
            userId: testUserId,
          },
        },
      });

      expect(assignment).toBeTruthy();
      expect(assignment?.userId).toBe(testUserId);
      expect(assignment?.projectId).toBe(projectId);
      expect(assignment?.queueId).toBe(queueId);
    });

    it("should handle duplicate assignment creation gracefully", async () => {
      // Create assignment first time
      await makeZodVerifiedAPICall(
        CreateAnnotationQueueAssignmentResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: secondTestUserId,
        },
        auth,
      );

      // Create same assignment again - should succeed (upsert behavior)
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueAssignmentResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: secondTestUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(secondTestUserId);

      // Verify only one assignment exists
      const assignments = await prisma.annotationQueueAssignment.findMany({
        where: {
          projectId,
          queueId,
          userId: secondTestUserId,
        },
      });

      expect(assignments).toHaveLength(1);
    });

    it("should return 404 for non-existent annotation queue", async () => {
      const nonExistentQueueId = uuidv4();

      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${nonExistentQueueId}/assignments`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for non-existent user", async () => {
      const nonExistentUserId = uuidv4();

      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: nonExistentUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should return 404 for user without project access", async () => {
      // Create a user without project access
      const userWithoutAccess = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: `noaccess-${uuidv4()}@example.com`,
          name: "No Access User",
        },
      });

      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: userWithoutAccess.id,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should validate request body", async () => {
      // Missing userId
      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {},
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should require valid queueId format", async () => {
      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/invalid-queue-id/assignments`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/public/annotation-queues/:queueId/assignments", () => {
    beforeEach(async () => {
      // Ensure assignment exists for delete tests
      await prisma.annotationQueueAssignment.upsert({
        where: {
          projectId_queueId_userId: {
            projectId,
            queueId,
            userId: testUserId,
          },
        },
        create: {
          projectId,
          queueId,
          userId: testUserId,
        },
        update: {},
      });
    });

    it("should delete annotation queue membership successfully", async () => {
      const response = await makeZodVerifiedAPICall(
        DeleteAnnotationQueueAssignmentResponse,
        "DELETE",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the membership was deleted from the database
      const assignment = await prisma.annotationQueueAssignment.findUnique({
        where: {
          projectId_queueId_userId: {
            projectId,
            queueId,
            userId: testUserId,
          },
        },
      });

      expect(assignment).toBeNull();
    });

    it("should handle deletion of non-existent assignment gracefully", async () => {
      // Delete a assignment that doesn't exist
      const nonExistentUserId = uuidv4();

      const response = await makeZodVerifiedAPICall(
        DeleteAnnotationQueueAssignmentResponse,
        "DELETE",
        `/api/public/annotation-queues/${queueId}/assignments`,
        {
          userId: nonExistentUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 404 for non-existent annotation queue", async () => {
      const nonExistentQueueId = uuidv4();

      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/${nonExistentQueueId}/assignments`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });
});
