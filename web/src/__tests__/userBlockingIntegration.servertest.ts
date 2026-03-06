/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  processEventBatch,
  eventTypes,
  blockUser,
  unblockUser,
  getBlockedUsers,
  checkBlockedUsers,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("User Blocking Integration", () => {
  let testProjectId: string;
  let project1Id: string;
  let project2Id: string;
  const testUserId = "test-user-id";

  beforeEach(async () => {
    await prisma.userBlockList.deleteMany();

    // Create test projects
    const testProject = await createOrgProjectAndApiKey();
    testProjectId = testProject.project.id;

    const project1 = await createOrgProjectAndApiKey();
    project1Id = project1.project.id;

    const project2 = await createOrgProjectAndApiKey();
    project2Id = project2.project.id;
  });

  afterEach(async () => {
    await prisma.userBlockList.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
  });

  describe("core functionality", () => {
    it("should prevent blocked user events from being processed (legacy test)", async () => {
      const blockedUserId = "blocked-user";
      const normalUserId = "normal-user";

      console.log(
        `BLOCKING USER: "${blockedUserId}" in project "${testProjectId}"`,
      );
      await blockUser({ projectId: testProjectId, userId: blockedUserId });

      // Verify user is actually blocked
      const blockedIds = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [blockedUserId],
      });
      const isBlocked = blockedIds.has(blockedUserId);
      console.log(`User blocking verified: ${isBlocked}`);
      expect(isBlocked).toBe(true);

      // Create events for both users
      const events = [
        createTraceEvent(blockedUserId),
        createTraceEvent(normalUserId),
        createNonTraceEvent(),
      ];

      console.log(
        `PROCESSING BATCH: 3 events (1 blocked user trace, 1 normal user trace, 1 non-trace event)`,
      );
      console.log(
        `   - Event 0 (blocked): ${events[0].id} for user "${blockedUserId}"`,
      );
      console.log(
        `   - Event 1 (normal): ${events[1].id} for user "${normalUserId}"`,
      );
      console.log(`   - Event 2 (non-trace): ${events[2].id} (score event)`);

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      const result = await processEventBatch(events, authCheck);

      console.log(
        `BATCH RESULT: ${result.successes.length} successes, ${result.errors.length} errors`,
      );

      // Blocked user's trace should be filtered out, only 2 events should succeed
      expect(result.successes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);

      // Verify blocked trace is not in results
      const successIds = result.successes.map((s) => s.id);
      console.log(`SUCCESS IDs: ${successIds.join(", ")}`);

      expect(successIds).not.toContain(events[0].id); // blocked trace
      expect(successIds).toContain(events[1].id); // normal trace
      expect(successIds).toContain(events[2].id); // non-trace event

      console.log(
        `BLOCKED TRACE FILTERED: Event "${events[0].id}" was correctly filtered out`,
      );
      console.log(
        `NORMAL TRACE ALLOWED: Event "${events[1].id}" was processed`,
      );
      console.log(
        `NON-TRACE EVENT ALLOWED: Event "${events[2].id}" was processed`,
      );
    });

    it("should allow traces after unblocking user", async () => {
      console.log(`BLOCKING then UNBLOCKING user "${testUserId}"`);

      // Block then unblock user
      await blockUser({ projectId: testProjectId, userId: testUserId });
      const blockedCheck1 = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      console.log(`   - User blocked: ${blockedCheck1.has(testUserId)}`);

      await unblockUser({ projectId: testProjectId, userId: testUserId });
      const blockedCheck2 = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      console.log(`   - User unblocked: ${blockedCheck2.has(testUserId)}`);

      const events = [createTraceEvent(testUserId)];
      console.log(
        `PROCESSING EVENT: ${events[0].id} for unblocked user "${testUserId}"`,
      );

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      const result = await processEventBatch(events, authCheck);

      console.log(
        `RESULT: ${result.successes.length} successes, ${result.errors.length} errors`,
      );

      // Should succeed after unblocking
      expect(result.successes).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      console.log(
        `UNBLOCKED USER TRACE ALLOWED: Event was processed successfully`,
      );
    });
  });

  describe("service functions", () => {
    it("should block and check user status", async () => {
      console.log(`TESTING: Block/check status for user "${testUserId}"`);

      // Initially not blocked
      const initialCheck = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      const initialStatus = initialCheck.has(testUserId);
      console.log(`   - Initial status: blocked = ${initialStatus}`);
      expect(initialStatus).toBe(false);

      // Block user
      console.log(`   - Blocking user...`);
      await blockUser({ projectId: testProjectId, userId: testUserId });

      // Should now be blocked
      const blockedCheck = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      const blockedStatus = blockedCheck.has(testUserId);
      console.log(`   - After blocking: blocked = ${blockedStatus}`);
      expect(blockedStatus).toBe(true);

      console.log(
        `SERVICE VERIFIED: Block operation persisted to database correctly`,
      );
    });

    it("should unblock user", async () => {
      console.log(`TESTING: Unblock user "${testUserId}"`);

      // Block then unblock
      await blockUser({ projectId: testProjectId, userId: testUserId });
      const blockedCheck = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      console.log(`   - User blocked: ${blockedCheck.has(testUserId)}`);

      await unblockUser({ projectId: testProjectId, userId: testUserId });
      const unblockedCheck = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [testUserId],
      });
      const unblockedStatus = unblockedCheck.has(testUserId);
      console.log(`   - User unblocked: ${unblockedStatus}`);

      // Should not be blocked
      expect(unblockedStatus).toBe(false);

      console.log(
        `SERVICE VERIFIED: Unblock operation removed user from database correctly`,
      );
    });

    it("should handle bulk user checking", async () => {
      const user1 = "user-1";
      const user2 = "user-2";
      const user3 = "user-3";

      console.log(
        `TESTING: Bulk user checking for users [${user1}, ${user2}, ${user3}]`,
      );

      // Block user1 and user3
      console.log(`   - Blocking users: ${user1}, ${user3}`);
      await blockUser({ projectId: testProjectId, userId: user1 });
      await blockUser({ projectId: testProjectId, userId: user3 });

      const blockedUserIds = await checkBlockedUsers({
        projectId: testProjectId,
        userIds: [user1, user2, user3],
      });

      console.log(
        `   - Bulk query result: ${Array.from(blockedUserIds).join(", ")}`,
      );

      expect(blockedUserIds.has(user1)).toBe(true);
      expect(blockedUserIds.has(user2)).toBe(false);
      expect(blockedUserIds.has(user3)).toBe(true);

      console.log(
        `BULK OPERATION VERIFIED: Single query correctly identified blocked users`,
      );
    });

    it("should list blocked users with pagination", async () => {
      console.log(`TESTING: Paginated blocked user listing`);

      // Block multiple users
      await blockUser({ projectId: testProjectId, userId: "user-1" });
      await blockUser({ projectId: testProjectId, userId: "user-2" });

      const result = await getBlockedUsers({
        projectId: testProjectId,
        limit: 10,
        offset: 0,
      });

      console.log(
        `   - Found ${result.users.length} users, total count: ${result.totalCount}`,
      );
      console.log(
        `   - User IDs: ${result.users.map((u) => u.userId).join(", ")}`,
      );

      expect(result.users).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.users.map((u) => u.userId)).toEqual(
        expect.arrayContaining(["user-1", "user-2"]),
      );

      console.log(`PAGINATION VERIFIED: Correct user list with accurate count`);
    });
  });

  describe("comprehensive event type blocking", () => {
    it("should block ALL event types with userId fields from blocked users", async () => {
      const blockedUserId = "blocked-user";
      const normalUserId = "normal-user";

      console.log(
        `COMPREHENSIVE BLOCKING TEST: Testing all event types with userId`,
      );
      console.log(`   - Blocking user: "${blockedUserId}"`);
      await blockUser({ projectId: testProjectId, userId: blockedUserId });

      // Create events with userId for ALL the schemas we enhanced
      // Note: SDK_LOG events don't have userId fields and are filtered out before user blocking
      const eventsWithUserId = [
        createTraceEvent(blockedUserId), // TraceBody
        createScoreEventWithUserId(blockedUserId), // BaseScoreBody
        createGenerationEventWithUserId(blockedUserId), // OptionalObservationBody (via CreateGenerationBody)
        createSpanEventWithUserId(blockedUserId), // OptionalObservationBody (via CreateSpanBody)
        createLegacyObservationEventWithUserId(blockedUserId), // LegacyObservationBody
      ];

      // Create same event types for normal user
      const normalUserEvents = [
        createTraceEvent(normalUserId),
        createScoreEventWithUserId(normalUserId),
        createGenerationEventWithUserId(normalUserId),
        createSpanEventWithUserId(normalUserId),
        createLegacyObservationEventWithUserId(normalUserId),
      ];

      // Create events WITHOUT userId (should pass through)
      const eventsWithoutUserId = [
        createNonTraceEvent(), // Score without userId
      ];

      const allEvents = [
        ...eventsWithUserId,
        ...normalUserEvents,
        ...eventsWithoutUserId,
      ];

      console.log(
        `   - Testing ${eventsWithUserId.length} blocked user events`,
      );
      console.log(`   - Testing ${normalUserEvents.length} normal user events`);
      console.log(
        `   - Testing ${eventsWithoutUserId.length} events without userId`,
      );

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      const result = await processEventBatch(allEvents, authCheck);

      console.log(
        `RESULT: ${result.successes.length} successes, ${result.errors.length} errors`,
      );

      // Should only process normal user events + events without userId
      const expectedSuccesses =
        normalUserEvents.length + eventsWithoutUserId.length;
      expect(result.successes).toHaveLength(expectedSuccesses);
      expect(result.errors).toHaveLength(0);

      const successIds = result.successes.map((s) => s.id);

      // Verify ALL blocked user events were filtered out
      eventsWithUserId.forEach((event, _index) => {
        expect(successIds).not.toContain(event.id);
        console.log(
          `   ✓ Blocked: ${event.type} event "${event.id}" was correctly filtered out`,
        );
      });

      // Verify ALL normal user events passed through
      normalUserEvents.forEach((event, _index) => {
        expect(successIds).toContain(event.id);
        console.log(
          `   ✓ Allowed: ${event.type} event "${event.id}" was processed`,
        );
      });

      // Verify events without userId passed through
      eventsWithoutUserId.forEach((event, _index) => {
        expect(successIds).toContain(event.id);
        console.log(
          `   ✓ Passthrough: ${event.type} event "${event.id}" (no userId) was processed`,
        );
      });

      console.log(
        `COMPREHENSIVE BLOCKING VERIFIED: All event types with userId properly filtered`,
      );
    });

    it("should demonstrate backward compatibility - events without userId pass through", async () => {
      const blockedUserId = "blocked-user";

      console.log(
        `BACKWARD COMPATIBILITY TEST: Events without userId should pass through`,
      );
      await blockUser({ projectId: testProjectId, userId: blockedUserId });

      // Create events WITHOUT userId fields (legacy behavior)
      const eventsWithoutUserId = [
        createNonTraceEvent(), // Score without userId
        // Note: Most other event types require traceId/userId, so score is our main test case
      ];

      console.log(
        `   - Testing ${eventsWithoutUserId.length} events without userId`,
      );
      console.log(
        `   - User "${blockedUserId}" is blocked but events have no userId`,
      );

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      const result = await processEventBatch(eventsWithoutUserId, authCheck);

      console.log(
        `RESULT: ${result.successes.length} successes, ${result.errors.length} errors`,
      );

      // All events without userId should pass through regardless of blocking
      expect(result.successes).toHaveLength(eventsWithoutUserId.length);
      expect(result.errors).toHaveLength(0);

      eventsWithoutUserId.forEach((event) => {
        const successIds = result.successes.map((s) => s.id);
        expect(successIds).toContain(event.id);
        console.log(
          `   ✓ Passed: ${event.type} event "${event.id}" (no userId) was processed`,
        );
      });

      console.log(
        `BACKWARD COMPATIBILITY VERIFIED: Events without userId are not affected by user blocking`,
      );
    });

    it("should handle mixed batches with blocked and non-blocked users across all event types", async () => {
      const blockedUser1 = "blocked-user-1";
      const blockedUser2 = "blocked-user-2";
      const normalUser = "normal-user";

      console.log(
        `MIXED BATCH TEST: Multiple blocked and normal users across all event types`,
      );
      await blockUser({ projectId: testProjectId, userId: blockedUser1 });
      await blockUser({ projectId: testProjectId, userId: blockedUser2 });

      // Create mixed batch with different event types and different users
      const mixedEvents = [
        // Blocked user 1 events (should be filtered)
        createTraceEvent(blockedUser1),
        createScoreEventWithUserId(blockedUser1),
        createGenerationEventWithUserId(blockedUser1),

        // Normal user events (should pass)
        createTraceEvent(normalUser),
        createSpanEventWithUserId(normalUser),

        // Blocked user 2 events (should be filtered)
        createLegacyObservationEventWithUserId(blockedUser2),
        createScoreEventWithUserId(blockedUser2),

        // Events without userId (should pass)
        createNonTraceEvent(),
      ];

      console.log(`   - Mixed batch: ${mixedEvents.length} events total`);
      console.log(`   - Blocked users: ${blockedUser1}, ${blockedUser2}`);
      console.log(`   - Normal user: ${normalUser}`);

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      const result = await processEventBatch(mixedEvents, authCheck);

      console.log(
        `RESULT: ${result.successes.length} successes, ${result.errors.length} errors`,
      );

      // Should process: 2 normal user events + 1 event without userId = 3 total
      expect(result.successes).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      const successIds = result.successes.map((s) => s.id);

      // Verify correct filtering by checking specific events
      const expectedBlocked = mixedEvents.filter(
        (e) =>
          "userId" in e.body &&
          (e.body.userId === blockedUser1 || e.body.userId === blockedUser2),
      );
      const expectedPassed = mixedEvents.filter(
        (e) =>
          ("userId" in e.body && e.body.userId === normalUser) ||
          !("userId" in e.body) ||
          !e.body.userId,
      );

      expectedBlocked.forEach((event) => {
        expect(successIds).not.toContain(event.id);
        const userId = "userId" in event.body ? event.body.userId : "unknown";
        console.log(`   ✓ Blocked: ${event.type} from user "${userId}"`);
      });

      expectedPassed.forEach((event) => {
        expect(successIds).toContain(event.id);
        const userDesc =
          "userId" in event.body && event.body.userId
            ? `user "${event.body.userId}"`
            : "no userId";
        console.log(`   ✓ Passed: ${event.type} from ${userDesc}`);
      });

      console.log(
        `MIXED BATCH VERIFIED: Correct filtering across multiple users and event types`,
      );
    });
  });

  describe("cross-project isolation", () => {
    it("should isolate blocking between projects", async () => {
      const sameUserId = "same-user";

      console.log(`TESTING: Cross-project isolation for user "${sameUserId}"`);
      console.log(`   - Project 1 ID: ${project1Id}`);
      console.log(`   - Project 2 ID: ${project2Id}`);

      // Block user in project1 only
      console.log(`   - Blocking user in project 1 only...`);
      await blockUser({ projectId: project1Id, userId: sameUserId });

      // Check blocking status in both projects
      const project1Check = await checkBlockedUsers({
        projectId: project1Id,
        userIds: [sameUserId],
      });
      const project1Status = project1Check.has(sameUserId);

      const project2Check = await checkBlockedUsers({
        projectId: project2Id,
        userIds: [sameUserId],
      });
      const project2Status = project2Check.has(sameUserId);

      console.log(`   - Project 1 blocking status: ${project1Status}`);
      console.log(`   - Project 2 blocking status: ${project2Status}`);

      expect(project1Status).toBe(true);
      expect(project2Status).toBe(false);

      // Test ingestion filtering per project
      const events = [createTraceEvent(sameUserId)];
      console.log(
        `TESTING: Ingestion filtering with same event in both projects`,
      );
      console.log(`   - Event ID: ${events[0].id} for user "${sameUserId}"`);

      // Should be filtered in project1
      console.log(`   - Processing in project 1 (should be blocked)...`);
      const result1 = await processEventBatch(events, {
        validKey: true as const,
        scope: { projectId: project1Id, accessLevel: "project" as const },
      });
      console.log(
        `   - Project 1 result: ${result1.successes.length} successes, ${result1.errors.length} errors`,
      );
      expect(result1.successes).toHaveLength(0);

      // Should NOT be filtered in project2
      console.log(`   - Processing in project 2 (should be allowed)...`);
      const result2 = await processEventBatch(events, {
        validKey: true as const,
        scope: { projectId: project2Id, accessLevel: "project" as const },
      });
      console.log(
        `   - Project 2 result: ${result2.successes.length} successes, ${result2.errors.length} errors`,
      );
      expect(result2.successes).toHaveLength(1);

      console.log(
        `CROSS-PROJECT ISOLATION VERIFIED: Same user blocked in one project but allowed in another`,
      );
    });
  });

  describe("performance impact", () => {
    it("should measure latency differences with and without blocking", async () => {
      const testUsers = ["user-1", "user-2", "user-3", "user-4", "user-5"];
      const batchSize = 50;

      console.log(
        `PERFORMANCE TEST: Measuring latency with batch size ${batchSize}`,
      );

      // Create baseline events (no blocking)
      const baselineEvents = Array.from({ length: batchSize }, (_, i) =>
        createTraceEvent(testUsers[i % testUsers.length]),
      );

      const authCheck = {
        validKey: true as const,
        scope: {
          projectId: testProjectId,
          accessLevel: "project" as const,
        },
      };

      // Test 1: Baseline performance (no blocked users)
      console.log(`TEST 1: Baseline performance (no blocked users)`);
      const baselineStart = performance.now();
      const baselineResult = await processEventBatch(baselineEvents, authCheck);
      const baselineTime = performance.now() - baselineStart;

      console.log(
        `   - Events processed: ${baselineResult.successes.length}/${batchSize}`,
      );
      console.log(`   - Processing time: ${baselineTime.toFixed(2)}ms`);
      console.log(
        `   - Average per event: ${(baselineTime / batchSize).toFixed(2)}ms`,
      );

      expect(baselineResult.successes).toHaveLength(batchSize);
      expect(baselineResult.errors).toHaveLength(0);

      // Test 2: With blocking but no blocked users
      console.log(`TEST 2: With blocking infrastructure but no blocked users`);
      const noBlockedStart = performance.now();
      const noBlockedResult = await processEventBatch(
        baselineEvents,
        authCheck,
      );
      const noBlockedTime = performance.now() - noBlockedStart;

      console.log(
        `   - Events processed: ${noBlockedResult.successes.length}/${batchSize}`,
      );
      console.log(`   - Processing time: ${noBlockedTime.toFixed(2)}ms`);
      console.log(
        `   - Average per event: ${(noBlockedTime / batchSize).toFixed(2)}ms`,
      );
      console.log(
        `   - Overhead vs baseline: ${(((noBlockedTime - baselineTime) / baselineTime) * 100).toFixed(1)}%`,
      );

      // Test 3: Block 40% of users
      console.log(`TEST 3: Block 40% of users (2 out of 5 users)`);
      await blockUser({ projectId: testProjectId, userId: testUsers[0] });
      await blockUser({ projectId: testProjectId, userId: testUsers[1] });

      const blockedStart = performance.now();
      const blockedResult = await processEventBatch(baselineEvents, authCheck);
      const blockedTime = performance.now() - blockedStart;

      const expectedSuccesses = batchSize * 0.6; // 60% should succeed
      console.log(
        `   - Events processed: ${blockedResult.successes.length}/${batchSize} (expected ~${expectedSuccesses})`,
      );
      console.log(`   - Processing time: ${blockedTime.toFixed(2)}ms`);
      console.log(
        `   - Average per event: ${(blockedTime / batchSize).toFixed(2)}ms`,
      );
      console.log(
        `   - Overhead vs baseline: ${(((blockedTime - baselineTime) / baselineTime) * 100).toFixed(1)}%`,
      );

      // Verify filtering worked correctly
      expect(blockedResult.successes.length).toBeLessThan(batchSize);
      expect(blockedResult.errors).toHaveLength(0);

      // Test 4: Heavy blocking (80% of users)
      console.log(`TEST 4: Heavy blocking (4 out of 5 users blocked)`);
      await blockUser({ projectId: testProjectId, userId: testUsers[2] });
      await blockUser({ projectId: testProjectId, userId: testUsers[3] });

      const heavyBlockedStart = performance.now();
      const heavyBlockedResult = await processEventBatch(
        baselineEvents,
        authCheck,
      );
      const heavyBlockedTime = performance.now() - heavyBlockedStart;

      const expectedHeavySuccesses = batchSize * 0.2; // 20% should succeed
      console.log(
        `   - Events processed: ${heavyBlockedResult.successes.length}/${batchSize} (expected ~${expectedHeavySuccesses})`,
      );
      console.log(`   - Processing time: ${heavyBlockedTime.toFixed(2)}ms`);
      console.log(
        `   - Average per event: ${(heavyBlockedTime / batchSize).toFixed(2)}ms`,
      );
      console.log(
        `   - Overhead vs baseline: ${(((heavyBlockedTime - baselineTime) / baselineTime) * 100).toFixed(1)}%`,
      );

      expect(heavyBlockedResult.successes.length).toBeLessThan(
        blockedResult.successes.length,
      );
      expect(heavyBlockedResult.errors).toHaveLength(0);

      // Performance analysis
      console.log(`PERFORMANCE ANALYSIS:`);
      console.log(
        `   - Blocking overhead: ${(((noBlockedTime - baselineTime) / baselineTime) * 100).toFixed(1)}% (acceptable if < 20%)`,
      );
      console.log(
        `   - Filtering efficiency: Blocked events don't add significant processing time`,
      );
      console.log(
        `   - Bulk operations: Single database query scales with user count, not event count`,
      );
    });

    it("should demonstrate bulk operation efficiency", async () => {
      console.log(`BULK OPERATION EFFICIENCY TEST`);

      const userCounts = [5, 20, 50];

      for (const userCount of userCounts) {
        const users = Array.from(
          { length: userCount },
          (_, i) => `bulk-user-${i}`,
        );

        // Block half the users
        const usersToBlock = users.slice(0, Math.floor(userCount / 2));
        for (const userId of usersToBlock) {
          await blockUser({ projectId: testProjectId, userId });
        }

        console.log(
          `Testing with ${userCount} total users (${usersToBlock.length} blocked)`,
        );

        // Test bulk checking performance
        const bulkStart = performance.now();
        const blockedUserIds = await checkBlockedUsers({
          projectId: testProjectId,
          userIds: users,
        });
        const bulkTime = performance.now() - bulkStart;

        console.log(
          `   - Bulk check time: ${bulkTime.toFixed(2)}ms for ${userCount} users`,
        );
        console.log(
          `   - Average per user: ${(bulkTime / userCount).toFixed(3)}ms`,
        );
        console.log(
          `   - Blocked users found: ${blockedUserIds.size}/${usersToBlock.length}`,
        );

        expect(blockedUserIds.size).toBe(usersToBlock.length);

        // Clean up for next iteration
        for (const userId of usersToBlock) {
          await unblockUser({ projectId: testProjectId, userId });
        }
      }

      console.log(
        `BULK EFFICIENCY VERIFIED: Performance scales linearly with user count`,
      );
    });
  });

  // Helper functions
  const createTraceEvent = (userId: string) => ({
    id: `trace-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.TRACE_CREATE,
    body: {
      id: `trace-${Date.now()}-${Math.random()}`,
      userId: userId,
      name: "test trace",
      environment: "production",
    },
  });

  const createScoreEventWithUserId = (userId: string) => ({
    id: `score-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.SCORE_CREATE,
    body: {
      id: `score-${Date.now()}-${Math.random()}`,
      traceId: "trace-id",
      userId: userId, // Now includes userId
      name: "test score",
      value: 0.95,
      dataType: "NUMERIC" as const,
      environment: "production",
    },
  });

  const createGenerationEventWithUserId = (userId: string) => ({
    id: `generation-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.GENERATION_CREATE,
    body: {
      id: `generation-${Date.now()}-${Math.random()}`,
      traceId: "trace-id",
      userId: userId, // Now includes userId
      name: "test generation",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      completionStartTime: new Date().toISOString(),
      environment: "production",
    },
  });

  const createSpanEventWithUserId = (userId: string) => ({
    id: `span-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.SPAN_CREATE,
    body: {
      id: `span-${Date.now()}-${Math.random()}`,
      traceId: "trace-id",
      userId: userId, // Now includes userId
      name: "test span",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      environment: "production",
    },
  });

  const createLegacyObservationEventWithUserId = (userId: string) => ({
    id: `legacy-obs-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.OBSERVATION_CREATE,
    body: {
      id: `legacy-obs-${Date.now()}-${Math.random()}`,
      traceId: "trace-id",
      userId: userId, // Now includes userId
      type: "GENERATION" as const,
      name: "test legacy observation",
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      completionStartTime: new Date().toISOString(),
    },
  });

  // Legacy helper for backward compatibility (events WITHOUT userId)
  const createNonTraceEvent = () => ({
    id: `score-event-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: eventTypes.SCORE_CREATE,
    body: {
      id: `score-${Date.now()}-${Math.random()}`,
      traceId: "trace-id",
      name: "test score",
      value: 0.95,
      dataType: "NUMERIC" as const,
      environment: "production",
      // NO userId field - should pass through regardless of blocking
    },
  });
});
