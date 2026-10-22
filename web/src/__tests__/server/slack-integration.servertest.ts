import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type * as SharedServer from "@langfuse/shared/src/server";
import type { Mock } from "vitest";
import { prisma, type Role } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { encrypt } from "@langfuse/shared/encryption";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import {
  createOrgProjectAndApiKey,
  SlackApiError,
  SLACK_CHANNEL_NOT_FOUND_MESSAGE,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

// Mock SlackService
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    SlackService: {
      getInstance: vi.fn(),
    },
  };
});

const __orgIds: string[] = [];
let mockSlackService: any;

// Bot is in both private channels; the installer's Slack user only in the first.
const INSTALLER_SLACK_USER_ID = "U_INSTALLER";
const installerPrivateChannel = {
  id: "G_SHARED",
  name: "installer-private",
  isPrivate: true,
  isMember: true,
};
const otherPrivateChannel = {
  id: "G_OTHER",
  name: "other-private",
  isPrivate: true,
  isMember: true,
};

const createSlackClient = () => ({
  auth: { test: vi.fn() },
  users: {
    conversations: vi.fn(async ({ user }: { user?: string }) => {
      if (!user)
        return {
          ok: true,
          channels: toSlackApi([installerPrivateChannel, otherPrivateChannel]),
        };
      if (user === INSTALLER_SLACK_USER_ID)
        return { ok: true, channels: toSlackApi([installerPrivateChannel]) };
      return { ok: true, channels: [] };
    }),
  },
});

const toSlackApi = (channels: { id: string; name: string }[]) =>
  channels.map(({ id, name }) => ({ id, name, is_private: true }));

const createIntegration = (
  projectId: string,
  installer: { installerUserId: string; installerSlackUserId: string } | null,
) =>
  prisma.slackIntegration.create({
    data: {
      projectId,
      teamId: "T123456",
      teamName: "Test Team",
      botToken: encrypt("xoxb-test-token"),
      botUserId: "U123456",
      ...installer,
    },
  });

const prepare = async ({
  projectRole = "ADMIN",
  admin = true,
}: { projectRole?: Role; admin?: boolean } = {}) => {
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
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: projectRole,
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: false,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
      admin,
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

    const { SlackService: ActualSlackService } = await vi.importActual<
      typeof SharedServer
    >("@langfuse/shared/src/server");

    // Slack API calls are mocked; private channel access logic runs for real.
    mockSlackService = {
      getWebClientForProject: vi.fn(),
      sendMessage: vi.fn(),
      getChannels: vi.fn(),
      getChannelInfo: vi.fn(),
      validateClient: vi.fn(),
      deleteIntegration: vi.fn(),
      getPrivateChannels: ActualSlackService.prototype.getPrivateChannels,
      checkPrivateChannelAccess:
        ActualSlackService.prototype.checkPrivateChannelAccess,
      findPublicChannelByName:
        ActualSlackService.prototype["findPublicChannelByName"],
    };

    // Setup the getInstance mock to return our mock service
    (SlackService.getInstance as Mock).mockReturnValue(mockSlackService);
  });

  beforeEach(() => {
    mockSlackService.getWebClientForProject.mockResolvedValue(
      createSlackClient(),
    );
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
        ];

        mockSlackService.getChannels.mockResolvedValue({
          channels: mockChannels,
        });

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

        // Without a recorded installer, the viewer is asked to re-authenticate.
        expect(result).toMatchObject({
          channels: mockChannels,
          hasPrivateChannelAccess: false,
          teamId: "T123456",
          teamName: "Test Team",
        });

        // 🔒 CRITICAL: Ensure no bot token is exposed in channel data
        expect(JSON.stringify(result)).not.toContain("xoxb-valid-token");
        expect(result).not.toHaveProperty("botToken");
      });

      it("lists private channels only for the installer, limited to ones they are a member of", async () => {
        mockSlackService.getChannels.mockResolvedValue({
          channels: [{ id: "C123456", name: "general", isPrivate: false }],
        });
        const { caller, project } = await prepare();
        const integration = await createIntegration(project.id, {
          installerUserId: "user-1",
          installerSlackUserId: INSTALLER_SLACK_USER_ID,
        });

        const asInstaller = await caller.slack.getChannels({
          projectId: project.id,
        });
        expect(asInstaller.channels.map((channel) => channel.name)).toEqual([
          "general",
          "installer-private",
        ]);

        await prisma.slackIntegration.update({
          where: { id: integration.id },
          data: { installerUserId: "another-user" },
        });
        const asOtherUser = await caller.slack.getChannels({
          projectId: project.id,
        });
        expect(JSON.stringify(asOtherUser)).not.toContain("private");
      });

      it.each(["MEMBER", "VIEWER"] as const)(
        "should reject %s, who can read automations but not manage them",
        async (projectRole) => {
          const { caller, project } = await prepare({
            projectRole,
            admin: false,
          });
          await createIntegration(project.id, null);
          mockSlackService.getChannels.mockClear();

          await expect(
            caller.slack.getChannels({ projectId: project.id }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          expect(mockSlackService.getChannels).not.toHaveBeenCalled();
        },
      );

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
        const mockClient = createSlackClient();
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

      it("should resolve channel info for manually-typed channel names", async () => {
        const mockClient = createSlackClient();
        mockSlackService.getWebClientForProject.mockResolvedValue(mockClient);
        mockSlackService.sendMessage.mockResolvedValue({
          messageTs: "1234567890.123456",
          channel: "C999888",
        });
        mockSlackService.getChannelInfo.mockResolvedValue({
          id: "C999888",
          name: "general",
          isPrivate: false,
        });

        const { caller, project } = await prepare();

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
          channelId: "#general",
          channelName: "general",
        });

        expect(result).toMatchObject({
          success: true,
          channel: "C999888",
          channelInfo: {
            id: "C999888",
            name: "general",
            isPrivate: false,
          },
        });

        expect(mockSlackService.getChannelInfo).toHaveBeenCalledWith(
          mockClient,
          "C999888",
        );

        // Verify audit log records the resolved channel ID, not the #-prefixed input
        const auditLogEntry = await prisma.auditLog.findFirst({
          where: {
            projectId: project.id,
            resourceType: "slackIntegration",
            action: "create",
          },
          orderBy: { createdAt: "desc" },
        });

        expect(auditLogEntry).toBeDefined();
        const afterData = auditLogEntry?.after
          ? JSON.parse(auditLogEntry.after)
          : null;
        expect(afterData).toMatchObject({
          channelId: "C999888",
        });
      });

      it("treats private channels the user can't use exactly like non-existent channels, without posting", async () => {
        const { caller, project } = await prepare();
        const integration = await createIntegration(project.id, {
          installerUserId: "user-1",
          installerSlackUserId: INSTALLER_SLACK_USER_ID,
        });
        mockSlackService.sendMessage.mockReset();
        mockSlackService.sendMessage.mockImplementation(
          async ({ channelId }: { channelId: string }) => {
            if (channelId !== installerPrivateChannel.id)
              throw new SlackApiError("not found", "channel_not_found");
            return { messageTs: "1234567890.123456", channel: channelId };
          },
        );
        const errorFor = (channelId: string) =>
          caller.slack
            .sendTestMessage({ projectId: project.id, channelId })
            .then(
              () => "sent",
              (error: TRPCError) => error.message,
            );

        // The installer may use private channels they are a member of.
        const result = await caller.slack.sendTestMessage({
          projectId: project.id,
          channelId: "#installer-private",
        });
        expect(result.channelInfo).toMatchObject({
          id: installerPrivateChannel.id,
          isPrivate: true,
        });
        expect(await errorFor("#other-private")).toBe(
          SLACK_CHANNEL_NOT_FOUND_MESSAGE,
        );

        await prisma.slackIntegration.update({
          where: { id: integration.id },
          data: { installerUserId: "another-user" },
        });
        for (const channelId of [
          "#installer-private",
          " #Installer-Private",
          installerPrivateChannel.id,
          "#does-not-exist",
        ]) {
          expect(await errorFor(channelId)).toBe(
            SLACK_CHANNEL_NOT_FOUND_MESSAGE,
          );
        }
        // Only the installer's channel and the non-existent one reached Slack.
        expect(mockSlackService.sendMessage).toHaveBeenCalledTimes(2);
      });

      it("on installs without groups:read, accepts only typed names of public channels", async () => {
        const client = createSlackClient();
        client.users.conversations.mockRejectedValue(
          Object.assign(new Error("missing_scope"), {
            data: { error: "missing_scope" },
          }),
        );
        mockSlackService.getWebClientForProject.mockResolvedValue(client);
        mockSlackService.getChannels.mockResolvedValue({
          channels: [{ id: "C123456", name: "general", isPrivate: false }],
        });
        mockSlackService.sendMessage.mockReset();
        mockSlackService.sendMessage.mockResolvedValue({
          messageTs: "1234567890.123456",
          channel: "C123456",
        });
        const { caller, project } = await prepare();
        await createIntegration(project.id, null);

        await caller.slack.sendTestMessage({
          projectId: project.id,
          channelId: "#General",
        });
        await expect(
          caller.slack.sendTestMessage({
            projectId: project.id,
            channelId: "#installer-private",
          }),
        ).rejects.toThrow(SLACK_CHANNEL_NOT_FOUND_MESSAGE);
        expect(mockSlackService.sendMessage).toHaveBeenCalledTimes(1);
      });

      it("should create audit log entry", async () => {
        const mockClient = createSlackClient();
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
      mockSlackService.getChannels.mockResolvedValue({
        channels: [
          { id: "C123456", name: "general", isPrivate: false, isMember: true },
        ],
      });
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
