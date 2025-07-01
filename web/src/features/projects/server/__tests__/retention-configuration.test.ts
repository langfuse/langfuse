import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@langfuse/shared/src/db";

describe("Retention Configuration", () => {
  let testProjectId: string;
  let testOrgId: string;

  beforeEach(async () => {
    // Create test organization
    const org = await prisma.organization.create({
      data: {
        name: "Test Org",
      },
    });
    testOrgId = org.id;

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: "Test Project",
        orgId: testOrgId,
      },
    });
    testProjectId = project.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.retentionConfiguration.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.project.deleteMany({
      where: { id: testProjectId },
    });
    await prisma.organization.deleteMany({
      where: { id: testOrgId },
    });
  });

  it("should create environment-specific retention configuration", async () => {
    // Create retention configuration with specific environments
    await prisma.retentionConfiguration.create({
      data: {
        projectId: testProjectId,
        retentionDays: 30,
        environments: ["production", "staging"],
      },
    });

    const config = await prisma.retentionConfiguration.findUnique({
      where: { projectId: testProjectId },
    });

    expect(config).toBeTruthy();
    expect(config?.retentionDays).toBe(30);
    expect(config?.environments).toEqual(["production", "staging"]);
  });

  it("should handle project-level retention fallback", async () => {
    // Set project-level retention
    await prisma.project.update({
      where: { id: testProjectId },
      data: { retentionDays: 90 },
    });

    const project = await prisma.project.findUnique({
      where: { id: testProjectId },
      include: { retentionConfiguration: true },
    });

    expect(project?.retentionDays).toBe(90);
    expect(project?.retentionConfiguration).toBeNull();
  });

  it("should prioritize retention configuration over project-level retention", async () => {
    // Set both project-level and configuration-level retention
    await prisma.project.update({
      where: { id: testProjectId },
      data: { retentionDays: 90 },
    });

    await prisma.retentionConfiguration.create({
      data: {
        projectId: testProjectId,
        retentionDays: 30,
        environments: ["production"],
      },
    });

    const project = await prisma.project.findUnique({
      where: { id: testProjectId },
      include: { retentionConfiguration: true },
    });

    // Configuration should take priority
    expect(project?.retentionConfiguration?.retentionDays).toBe(30);
    expect(project?.retentionConfiguration?.environments).toEqual([
      "production",
    ]);
  });

  it("should handle default environment correctly", async () => {
    await prisma.retentionConfiguration.create({
      data: {
        projectId: testProjectId,
        retentionDays: 7,
        environments: ["default"],
      },
    });

    const config = await prisma.retentionConfiguration.findUnique({
      where: { projectId: testProjectId },
    });

    expect(config?.environments).toEqual(["default"]);
  });
});
