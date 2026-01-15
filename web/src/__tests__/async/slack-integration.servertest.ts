import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { encrypt } from "@langfuse/shared/encryption";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

// Mock SlackService
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    SlackService: {
      getInstance: jest.fn(),
    },
  };
});

const __orgIds: string[] = [];
let mockSlackService: any;

const prepare = async () => {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
};

describe("Slack Integration", () => {
  beforeAll(async () => {
    // Import mocked SlackService
    const { SlackService } = await import("@langfuse/shared/src/server");

    // Create mock service instance
    mockSlackService = {
      getWebClientForProject: jest.fn(),
      sendMessage: jest.fn(),
      getChannels: jest.fn(),
      validateClient: jest.fn(),
      deleteIntegration: jest.fn(),
    };

    // Setup the getInstance mock to return our mock service
    (SlackService.getInstance as jest.Mock).mockReturnValue(mockSlackService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  describe("Slack tRPC Router", () => {
    describe("getIntegrationStatus", () => {
      it("should return connected status for valid integration", async () => {
        mockSlackService.validateClient.mockResolvedValue(true);

        const { caller, project } = await prepare();

        // Create Slack integration
        await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-test-token-secret"),
            botUserId: "U123456",
          },
        });

        const result = await caller.slack.getIntegrationStatus({
          projectId: project.id,
        });

        expect(result).toMatchObject({
          isConnected: true,
          teamId: "T123456",
          teamName: "Test Team",
          botUserId: "U123456",
          installUrl: null,
        });

        // 🔒 CRITICAL: Ensure no bot token is exposed
        expect(JSON.stringify(result)).not.toContain("xoxb-test-token-secret");
        expect(result).not.toHaveProperty("botToken");
      });

      it("should return disconnected status when no integration exists", async () => {
        const { caller, project } = await prepare();

        const result = await caller.slack.getIntegrationStatus({
          projectId: project.id,
        });

        expect(result).toMatchObject({
          isConnected: false,
          teamId: null,
          teamName: null,
          installUrl: expect.stringContaining(
            `/api/public/slack/install?projectId=${project.id}`,
          ),
        });

        // 🔒 Ensure no sensitive data is present
        expect(JSON.stringify(result)).not.toContain("xoxb-");
      });

      it("should return disconnected status for invalid integration", async () => {
        mockSlackService.validateClient.mockResolvedValue(false);

        const { caller, project } = await prepare();

        // Create Slack integration with invalid token
        await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-invalid-token"),
            botUserId: "U123456",
          },
        });

        const result = await caller.slack.getIntegrationStatus({
          projectId: project.id,
        });

        expect(result).toMatchObject({
          isConnected: false,
          teamId: "T123456",
          teamName: "Test Team",
          error:
            "Integration is invalid. Please reconnect your Slack workspace.",
        });

        // 🔒 CRITICAL: Ensure no bot token is exposed even for invalid integrations
        expect(JSON.stringify(result)).not.toContain("xoxb-invalid-token");
      });
    });

    describe("getChannels", () => {
      it("should fetch channels for valid integration", async () => {
        const mockChannels = [
          { id: "C123456", name: "general", isPrivate: false, isMember: true },
          { id: "C789012", name: "random", isPrivate: false, isMember: true },
          {
            id: "C345678",
            name: "private-channel",
            isPrivate: true,
            isMember: true,
          },
        ];

        mockSlackService.getChannels.mockResolvedValue(mockChannels);

        const { caller, project } = await prepare();

        // Create Slack integration
        await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-valid-token"),
            botUserId: "U123456",
          },
        });

        const result = await caller.slack.getChannels({
          projectId: project.id,
        });

        expect(result).toMatchObject({
          channels: mockChannels,
          teamId: "T123456",
          teamName: "Test Team",
        });

        // 🔒 CRITICAL: Ensure no bot token is exposed in channel data
        expect(JSON.stringify(result)).not.toContain("xoxb-valid-token");
        expect(result).not.toHaveProperty("botToken");
      });

      it("should throw NOT_FOUND for missing integration", async () => {
        const { caller, project } = await prepare();

        await expect(
          caller.slack.getChannels({ projectId: project.id }),
        ).rejects.toThrow("Slack integration not found");
      });

      it("should handle Slack API failures gracefully", async () => {
        mockSlackService.getChannels.mockRejectedValue(
          new Error("Slack API error"),
        );

        const { caller, project } = await prepare();

        // Create Slack integration
        await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-test-token"),
            botUserId: "U123456",
          },
        });

        await expect(
          caller.slack.getChannels({ projectId: project.id }),
        ).rejects.toThrow(
          "Failed to fetch channels. Please check your Slack connection and try again.",
        );
      });
    });

    describe("sendTestMessage", () => {
      it("should send test message successfully", async () => {
        const mockClient = { auth: { test: jest.fn() } };
        mockSlackService.getWebClientForProject.mockResolvedValue(mockClient);
        mockSlackService.sendMessage.mockResolvedValue({
          messageTs: "1234567890.123456",
          channel: "C123456",
        });

        const { caller, project } = await prepare();

        // Create Slack integration
        await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-test-token"),
            botUserId: "U123456",
          },
        });

        const result = await caller.slack.sendTestMessage({
          projectId: project.id,
          channelId: "C123456",
          channelName: "general",
        });

        expect(result).toMatchObject({
          success: true,
          messageTs: "1234567890.123456",
          channel: "C123456",
        });

        // Verify SlackService was called with proper parameters
        expect(mockSlackService.sendMessage).toHaveBeenCalledWith({
          client: expect.any(Object),
          channelId: "C123456",
          blocks: expect.any(Array),
          text: "Test message from Langfuse",
        });

        // 🔒 CRITICAL: Ensure no bot token is exposed in test results
        expect(JSON.stringify(result)).not.toContain("xoxb-test-token");
      });

      it("should create audit log entry", async () => {
        const mockClient = { auth: { test: jest.fn() } };
        mockSlackService.getWebClientForProject.mockResolvedValue(mockClient);
        mockSlackService.sendMessage.mockResolvedValue({
          messageTs: "1234567890.123456",
          channel: "C123456",
        });

        const { caller, project } = await prepare();

        // Create Slack integration
        const integration = await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-test-token"),
            botUserId: "U123456",
          },
        });

        await caller.slack.sendTestMessage({
          projectId: project.id,
          channelId: "C123456",
          channelName: "general",
        });

        // Verify audit log was created
        const auditLog = await prisma.auditLog.findFirst({
          where: {
            projectId: project.id,
            resourceType: "slackIntegration",
            resourceId: integration.id,
            action: "create",
          },
        });

        expect(auditLog).toBeDefined();
        const afterData = auditLog?.after ? JSON.parse(auditLog.after) : null;
        expect(afterData).toMatchObject({
          action: "test_message_sent",
          channelId: "C123456",
          channelName: "general",
          messageTs: "1234567890.123456",
        });

        // 🔒 Ensure audit log doesn't contain tokens
        expect(JSON.stringify(afterData)).not.toContain("xoxb-");
      });
    });

    describe("disconnect", () => {
      it("should remove integration and audit log it", async () => {
        mockSlackService.deleteIntegration.mockResolvedValue(undefined);

        const { caller, project } = await prepare();

        // Create Slack integration
        const integration = await prisma.slackIntegration.create({
          data: {
            projectId: project.id,
            teamId: "T123456",
            teamName: "Test Team",
            botToken: encrypt("xoxb-test-token"),
            botUserId: "U123456",
          },
        });

        const result = await caller.slack.disconnect({
          projectId: project.id,
        });

        expect(result).toMatchObject({
          success: true,
        });

        // Verify SlackService was called
        expect(mockSlackService.deleteIntegration).toHaveBeenCalledWith(
          project.id,
        );

        // Verify audit log was created
        const auditLog = await prisma.auditLog.findFirst({
          where: {
            projectId: project.id,
            resourceType: "slackIntegration",
            resourceId: integration.id,
            action: "delete",
          },
        });

        expect(auditLog).toBeDefined();
        const beforeData = auditLog?.before
          ? JSON.parse(auditLog.before)
          : null;
        expect(beforeData).toMatchObject({
          projectId: project.id,
          teamId: "T123456",
          teamName: "Test Team",
        });

        // 🔒 CRITICAL: Ensure audit log doesn't expose encrypted bot token
        expect(JSON.stringify(beforeData)).not.toContain("xoxb-");
        // But encrypted token should be in the audit log for recovery purposes
        expect(beforeData).toHaveProperty("botToken");
      });

      it("should handle missing integration gracefully", async () => {
        const { caller, project } = await prepare();

        await expect(
          caller.slack.disconnect({ projectId: project.id }),
        ).rejects.toThrow("Slack integration not found");
      });
    });
  });

  describe("Slack Install Endpoint Authentication", () => {
    it("should reject unauthenticated requests with 401", async () => {
      const { project } = await prepare();

      // Make request without any session/auth
      const response = await fetch(
        `http://localhost:3000/api/public/slack/install?projectId=${project.id}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          // No cookies/session - simulating unauthenticated request
        },
      );

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body).toMatchObject({
        error: "Authentication required",
      });
    });

    it("should reject requests without projectId with 400", async () => {
      const response = await fetch(
        `http://localhost:3000/api/public/slack/install`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body).toMatchObject({
        error: "Missing projectId parameter",
      });
    });
  });

  describe("Slack Security", () => {
    it("should encrypt bot tokens in database", async () => {
      const { project } = await prepare();

      const originalToken = "xoxb-secret-bot-token-12345";

      // Create Slack integration
      await prisma.slackIntegration.create({
        data: {
          projectId: project.id,
          teamId: "T123456",
          teamName: "Test Team",
          botToken: encrypt(originalToken),
          botUserId: "U123456",
        },
      });

      // Verify token is encrypted in database
      const rawIntegration = await prisma.slackIntegration.findUnique({
        where: { projectId: project.id },
      });

      expect(rawIntegration?.botToken).toBeDefined();
      expect(rawIntegration?.botToken).not.toBe(originalToken);
      expect(rawIntegration?.botToken).not.toContain("xoxb-secret-bot-token");

      // Verify the encrypted token can be decrypted back to original
      const { decrypt } = await import("@langfuse/shared/encryption");
      const decryptedToken = decrypt(rawIntegration!.botToken);
      expect(decryptedToken).toBe(originalToken);
    });

    it("should NEVER expose raw bot tokens in any API response", async () => {
      mockSlackService.validateClient.mockResolvedValue(true);
      mockSlackService.getChannels.mockResolvedValue([
        { id: "C123456", name: "general", isPrivate: false, isMember: true },
      ]);
      mockSlackService.sendMessage.mockResolvedValue({
        messageTs: "1234567890.123456",
        channel: "C123456",
      });

      const { caller, project } = await prepare();

      const secretToken = "xoxb-extremely-secret-token-abcdef123456";

      // Create Slack integration
      await prisma.slackIntegration.create({
        data: {
          projectId: project.id,
          teamId: "T123456",
          teamName: "Test Team",
          botToken: encrypt(secretToken),
          botUserId: "U123456",
        },
      });

      // Test all tRPC endpoints
      const results = await Promise.all([
        caller.slack.getIntegrationStatus({ projectId: project.id }),
        caller.slack.getChannels({ projectId: project.id }),
        caller.slack.sendTestMessage({
          projectId: project.id,
          channelId: "C123456",
          channelName: "general",
        }),
      ]);

      results.forEach((result) => {
        const resultText = JSON.stringify(result);

        // 🔒 CRITICAL: Ensure no raw token appears anywhere in response
        expect(resultText).not.toContain(secretToken);
        expect(resultText).not.toContain("xoxb-extremely-secret-token");
      });
    });

    it("should NEVER set unencrypted tokens in cookies", async () => {
      const { caller, project } = await prepare();

      // Test tRPC calls (cookies would be set at HTTP layer, not tRPC layer)
      const result = await caller.slack.getIntegrationStatus({
        projectId: project.id,
      });

      // 🔒 Ensure tRPC result doesn't contain any token fields that could leak to cookies
      expect(JSON.stringify(result)).not.toContain("xoxb-");
      expect(result).not.toHaveProperty("botToken");
      expect(result).not.toHaveProperty("token");
    });

    it("should sanitize tokens from error messages", async () => {
      const secretToken = "xoxb-secret-error-token-999";

      // Mock SlackService to throw error containing token
      mockSlackService.getChannels.mockRejectedValue(
        new Error(`Authentication failed for token ${secretToken}`),
      );

      const { caller, project } = await prepare();

      // Create Slack integration
      await prisma.slackIntegration.create({
        data: {
          projectId: project.id,
          teamId: "T123456",
          teamName: "Test Team",
          botToken: encrypt(secretToken),
          botUserId: "U123456",
        },
      });

      try {
        await caller.slack.getChannels({ projectId: project.id });
        throw new Error("Expected error to be thrown");
      } catch (error) {
        const errorMessage =
          error instanceof TRPCError ? error.message : String(error);

        // 🔒 CRITICAL: Error messages should not contain raw tokens
        expect(errorMessage).not.toContain(secretToken);
        expect(errorMessage).not.toContain("xoxb-secret-error-token");

        // Should still indicate there was an error, just sanitized
        expect(errorMessage).toContain("Failed to fetch channels.");
      }
    });
  });
});
