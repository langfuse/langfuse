/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  makeAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import {
  CreateAnnotationQueueMembershipResponse,
  DeleteAnnotationQueueMembershipResponse,
} from "@/src/features/public-api/types/annotation-queues";

describe("/api/public/annotation-queues/:queueId/memberships API", () => {
  let auth: string;
  let projectId: string;
  let orgId: string;
  let queueId: string;
  let testUserId: string;
  let secondTestUserId: string;

  beforeAll(async () => {
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
        name: "Test Queue for Memberships",
        description: "Test queue for membership testing",
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

  afterAll(async () => {
    await pruneDatabase();
  });

  describe("POST /api/public/annotation-queues/:queueId/memberships", () => {
    it("should create annotation queue membership successfully", async () => {
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueMembershipResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
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
      const membership = await prisma.annotationQueueMembership.findUnique({
        where: {
          projectId_annotationQueueId_userId: {
            projectId,
            annotationQueueId: queueId,
            userId: testUserId,
          },
        },
      });

      expect(membership).toBeTruthy();
      expect(membership?.userId).toBe(testUserId);
      expect(membership?.projectId).toBe(projectId);
      expect(membership?.annotationQueueId).toBe(queueId);
    });

    it("should handle duplicate membership creation gracefully", async () => {
      // Create membership first time
      await makeZodVerifiedAPICall(
        CreateAnnotationQueueMembershipResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: secondTestUserId,
        },
        auth,
      );

      // Create same membership again - should succeed (upsert behavior)
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueMembershipResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: secondTestUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(secondTestUserId);

      // Verify only one membership exists
      const memberships = await prisma.annotationQueueMembership.findMany({
        where: {
          projectId,
          annotationQueueId: queueId,
          userId: secondTestUserId,
        },
      });

      expect(memberships).toHaveLength(1);
    });

    it("should return 404 for non-existent annotation queue", async () => {
      const nonExistentQueueId = uuidv4();

      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${nonExistentQueueId}/memberships`,
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
        `/api/public/annotation-queues/${queueId}/memberships`,
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
        `/api/public/annotation-queues/${queueId}/memberships`,
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
        `/api/public/annotation-queues/${queueId}/memberships`,
        {},
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should require valid queueId format", async () => {
      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/invalid-queue-id/memberships`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/public/annotation-queues/:queueId/memberships", () => {
    beforeEach(async () => {
      // Ensure membership exists for delete tests
      await prisma.annotationQueueMembership.upsert({
        where: {
          projectId_annotationQueueId_userId: {
            projectId,
            annotationQueueId: queueId,
            userId: testUserId,
          },
        },
        create: {
          projectId,
          annotationQueueId: queueId,
          userId: testUserId,
        },
        update: {},
      });
    });

    it("should delete annotation queue membership successfully", async () => {
      const response = await makeZodVerifiedAPICall(
        DeleteAnnotationQueueMembershipResponse,
        "DELETE",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the membership was deleted from the database
      const membership = await prisma.annotationQueueMembership.findUnique({
        where: {
          projectId_annotationQueueId_userId: {
            projectId,
            annotationQueueId: queueId,
            userId: testUserId,
          },
        },
      });

      expect(membership).toBeNull();
    });

    it("should handle deletion of non-existent membership gracefully", async () => {
      // Delete a membership that doesn't exist
      const nonExistentUserId = uuidv4();

      const response = await makeZodVerifiedAPICall(
        DeleteAnnotationQueueMembershipResponse,
        "DELETE",
        `/api/public/annotation-queues/${queueId}/memberships`,
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
        `/api/public/annotation-queues/${nonExistentQueueId}/memberships`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });

    it("should validate request body", async () => {
      // Missing userId
      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {},
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("should require valid queueId format", async () => {
      const response = await makeAPICall(
        "DELETE",
        `/api/public/annotation-queues/invalid-queue-id/memberships`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Authorization", () => {
    it("should require valid authentication", async () => {
      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: testUserId,
        },
        "invalid-auth",
      );

      expect(response.status).toBe(401);
    });

    it("should enforce project-level access control", async () => {
      // Create another project with different auth
      const { auth: otherAuth } = await createOrgProjectAndApiKey();

      const response = await makeAPICall(
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: testUserId,
        },
        otherAuth,
      );

      expect(response.status).toBe(404);
    });
  });

  describe("User Access Validation", () => {
    it("should allow assignment of user with organization membership", async () => {
      // Create user with org membership but no project membership
      const orgUser = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: `orguser-${uuidv4()}@example.com`,
          name: "Org User",
        },
      });

      await prisma.organizationMembership.create({
        data: {
          orgId,
          userId: orgUser.id,
          role: "MEMBER",
        },
      });

      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueMembershipResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: orgUser.id,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(orgUser.id);
    });

    it("should allow assignment of user with project membership only", async () => {
      // This test uses existing testUserId which has project membership
      const response = await makeZodVerifiedAPICall(
        CreateAnnotationQueueMembershipResponse,
        "POST",
        `/api/public/annotation-queues/${queueId}/memberships`,
        {
          userId: testUserId,
        },
        auth,
      );

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(testUserId);
    });
  });
});
