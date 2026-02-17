import { v4 as uuidv4 } from "uuid";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import {
  blockUser,
  checkBlockedUsers,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("User Blocking Unit Tests", () => {
  let projectId: string;

  beforeEach(async () => {
    await pruneDatabase();

    // Create a test project for each test
    const testProject = await createOrgProjectAndApiKey();
    projectId = testProject.project.id;
  });

  afterEach(async () => {
    await pruneDatabase();
  });

  describe("User Blocking Functions", () => {
    it("should block and retrieve blocked users correctly", async () => {
      const userId1 = "blocked-user-1";
      const userId2 = "blocked-user-2";
      const userId3 = "regular-user-1";

      // Block two users
      await blockUser({ projectId, userId: userId1 });
      await blockUser({ projectId, userId: userId2 });

      // Test checkBlockedUsers with mixed user list
      const userIds = [userId1, userId2, userId3];
      const blockedIds = await checkBlockedUsers({ projectId, userIds });

      // Should return only the blocked users
      expect(blockedIds.size).toBe(2);
      expect(blockedIds.has(userId1)).toBe(true);
      expect(blockedIds.has(userId2)).toBe(true);
      expect(blockedIds.has(userId3)).toBe(false);

      console.log("User blocking functionality works correctly");
    });
  });
});
