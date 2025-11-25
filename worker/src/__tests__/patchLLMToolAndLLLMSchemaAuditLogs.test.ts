import { expect, describe, it, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import PatchLLMToolAndLLLMSchemaAuditLogs from "../backgroundMigrations/patchLLMToolAndLLLMSchemaAuditLogs";

describe("PatchLLMToolAndLLLMSchemaAuditLogs", () => {
  let migration: PatchLLMToolAndLLLMSchemaAuditLogs;
  let testOrgId: string;
  let testProjectId: string;

  beforeEach(async () => {
    migration = new PatchLLMToolAndLLLMSchemaAuditLogs();
    testOrgId = uuidv4();
    testProjectId = uuidv4();
  });

  it("should correctly patch various audit log scenarios", async () => {
    // Create test data with different scenarios
    const auditLogs = [
      // 1. Valid llmTool with parameters in before
      {
        id: `aa-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should be corrected
        resourceId: uuidv4(), // Different from project ID
        action: "create",
        before: JSON.stringify({
          name: "test-tool",
          parameters: {
            type: "object",
            properties: { input: { type: "string" } },
          },
          description: "Test tool",
        }),
        after: null,
      },
      // 2. Valid llmSchema with schema in after
      {
        id: `ab-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should be corrected
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: null,
        after: JSON.stringify({
          name: "test-schema",
          schema: {
            type: "object",
            properties: { output: { type: "string" } },
          },
          description: "Test schema",
        }),
      },
      // 3. Valid llmTool with parameters in after (before is null)
      {
        id: `ac-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should be corrected
        resourceId: uuidv4(), // Different from project ID
        action: "create",
        before: null,
        after: JSON.stringify({
          name: "tool-after",
          parameters: {
            type: "object",
            properties: { param1: { type: "number" } },
          },
          description: "Tool with parameters in after",
        }),
      },
      // 4. Valid llmSchema with schema in before
      {
        id: `ad-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should be corrected
        resourceId: uuidv4(), // Different from project ID
        action: "delete",
        before: JSON.stringify({
          name: "schema-before",
          schema: { type: "array", items: { type: "string" } },
          description: "Schema with schema in before",
        }),
        after: null,
      },
      // 5. Empty parameters
      {
        id: `ae-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should remain project
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: JSON.stringify({
          name: "empty-params",
          parameters: {},
          description: "Empty parameters",
        }),
        after: null,
      },
      // 6. Empty schema
      {
        id: `af-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should remain project
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: JSON.stringify({
          name: "empty-schema",
          schema: {},
          description: "Empty schema",
        }),
        after: null,
      },
      // 7. Record with malformed JSON in before
      {
        id: `ah-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should remain project due to malformed JSON
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: "invalid json {",
        after: null,
      },
      // 8. Record with malformed JSON in after
      {
        id: `ai-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should remain project due to malformed JSON
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: null,
        after: "invalid json }",
      },
      // 9. Record with correct resource type already (should not be affected)
      {
        id: `aj-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "llmTool", // Already correct
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: JSON.stringify({
          name: "already-correct",
          parameters: {
            type: "object",
            properties: { input: { type: "string" } },
          },
          description: "Already correct resource type",
        }),
        after: null,
      },
      // 10. Record with resourceId matching projectId (should not be affected)
      {
        id: `ak-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project",
        resourceId: testProjectId, // Same as project ID
        action: "update",
        before: JSON.stringify({
          name: "matching-ids",
          parameters: {
            type: "object",
            properties: { input: { type: "string" } },
          },
          description: "Resource ID matches project ID",
        }),
        after: null,
      },
      // 11. Record with null/empty before and after
      {
        id: `al-${uuidv4()}`,
        orgId: testOrgId,
        projectId: testProjectId,
        resourceType: "project", // Wrong type, should remain project due to no data
        resourceId: uuidv4(), // Different from project ID
        action: "update",
        before: null,
        after: null,
      },
    ];

    // Insert test audit logs
    await prisma.auditLog.createMany({
      data: auditLogs,
    });

    // Run migration
    await migration.run();

    // Verify results
    const updatedLogs = await prisma.auditLog.findMany({
      where: {
        id: { in: auditLogs.map((log) => log.id) },
      },
      orderBy: { id: "asc" },
    });

    // Check each scenario
    expect(updatedLogs[0].resourceType).toBe("llmTool"); // Has parameters in before
    expect(updatedLogs[1].resourceType).toBe("llmSchema"); // Has schema in after
    expect(updatedLogs[2].resourceType).toBe("llmTool"); // Has parameters in after
    expect(updatedLogs[3].resourceType).toBe("llmSchema"); // Has schema in before
    expect(updatedLogs[4].resourceType).toBe("llmTool"); // Empty parameters
    expect(updatedLogs[5].resourceType).toBe("llmSchema"); // Empty schema
    expect(updatedLogs[6].resourceType).toBe("project"); // Malformed JSON in before
    expect(updatedLogs[7].resourceType).toBe("project"); // Malformed JSON in after
    expect(updatedLogs[8].resourceType).toBe("llmTool"); // Already correct, should not be affected
    expect(updatedLogs[9].resourceType).toBe("project"); // Resource ID matches project ID
    expect(updatedLogs[10].resourceType).toBe("project"); // Null/empty before and after

    // Clean up
    await prisma.auditLog.deleteMany({
      where: {
        id: { in: auditLogs.map((log) => log.id) },
      },
    });
  }, 60_000);

  it("should handle batching correctly for large datasets", async () => {
    // Create more than 1000 audit logs to test batching
    const largeDataset = Array.from({ length: 1250 }, (_, index) => ({
      id: uuidv4(),
      orgId: testOrgId,
      projectId: testProjectId,
      resourceType: "project", // Wrong type, should be corrected
      resourceId: uuidv4(), // Different from project ID
      action: "create",
      before: JSON.stringify({
        name: `test-tool-${index}`,
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
        },
        description: `Test tool ${index}`,
      }),
      after: null,
    }));

    // Insert test audit logs
    await prisma.auditLog.createMany({
      data: largeDataset,
    });

    // Run migration
    await migration.run();

    // Verify all records were processed
    const updatedLogs = await prisma.auditLog.findMany({
      where: {
        id: { in: largeDataset.map((log) => log.id) },
      },
    });

    // All should be updated to llmTool
    expect(updatedLogs.every((log) => log.resourceType === "llmTool")).toBe(
      true,
    );
    expect(updatedLogs.length).toBe(1250);

    // Clean up
    await prisma.auditLog.deleteMany({
      where: {
        id: { in: largeDataset.map((log) => log.id) },
      },
    });
  }, 60_000);
});
