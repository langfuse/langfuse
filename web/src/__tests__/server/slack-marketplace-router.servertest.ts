import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import type { Session } from "next-auth";
import { TRPCError } from "@trpc/server";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { appRouter } from "@/src/server/api/root";
import {
  createOrgProjectAndApiKey,
  hashSlackPendingInstallClaimToken,
} from "@langfuse/shared/src/server";

// These tests exercise the real SlackService + prisma (no mock), so they live in
// their own file — the existing slack-integration.servertest.ts mocks SlackService
// at the module level.

type SessionProject = { id: string; name: string; role: string };

function buildSession(
  org: { id: string; name: string },
  projects: SessionProject[],
): Session {
  return {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: projects.map((p) => ({
            id: p.id,
            role: p.role,
            retentionDays: 30,
            deletedAt: null,
            name: p.name,
            metadata: {},
          })),
        },
      ],
      featureFlags: { excludeClickhouseRead: false, templateFlag: true },
      // not an instance admin, so project RBAC is actually enforced
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  } as unknown as Session;
}

function callerFor(session: Session) {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

let teamCounter = 0;
const uniqueTeamId = (label: string) =>
  `T-router-${Date.now()}-${teamCounter++}-${label}`;
const CLAIM_TOKEN = "router-claim-token";

async function createPendingRow(
  teamId: string,
  teamName = "Test Workspace",
  claimToken = CLAIM_TOKEN,
) {
  return prisma.slackIntegration.create({
    data: {
      projectId: null,
      teamId,
      teamName,
      botToken: encrypt("xoxb-test"),
      botUserId: "U-test",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      claimTokenHash: hashSlackPendingInstallClaimToken(claimToken),
    },
  });
}

describe("slack marketplace tRPC router", () => {
  describe("getPendingInstallation", () => {
    it("returns isPending false when none exists", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );

      const res = await caller.slack.getPendingInstallation({
        teamId: uniqueTeamId("none"),
        claim: CLAIM_TOKEN,
      });
      expect(res.isPending).toBe(false);
      expect(res.teamName).toBeNull();
    });

    it("returns the pending workspace when one exists", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );
      const teamId = uniqueTeamId("exists");
      await createPendingRow(teamId, "Acme Inc");

      const res = await caller.slack.getPendingInstallation({
        teamId,
        claim: CLAIM_TOKEN,
      });
      expect(res).toEqual({ isPending: true, teamId, teamName: "Acme Inc" });
    });

    it("does not expose the pending workspace without the matching claim", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );
      const teamId = uniqueTeamId("wrong-claim");
      await createPendingRow(teamId, "Acme Inc");

      const res = await caller.slack.getPendingInstallation({
        teamId,
        claim: "wrong-claim",
      });
      expect(res).toEqual({ isPending: false, teamId: null, teamName: null });
    });
  });

  describe("getConnectableProjects", () => {
    it("returns CUD projects with connection status and excludes non-CUD projects", async () => {
      const { project: connectedProject, org } =
        await createOrgProjectAndApiKey();
      // second project in the same org, no Slack integration
      const unconnectedProject = await prisma.project.create({
        data: { name: `proj-${Date.now()}`, orgId: org.id },
      });
      // already-connected integration for the first project
      await prisma.slackIntegration.create({
        data: {
          projectId: connectedProject.id,
          teamId: uniqueTeamId("connected"),
          teamName: "Connected WS",
          botToken: encrypt("xoxb"),
          botUserId: "U1",
        },
      });

      const caller = callerFor(
        buildSession(org, [
          {
            id: connectedProject.id,
            name: connectedProject.name,
            role: "ADMIN",
          },
          {
            id: unconnectedProject.id,
            name: unconnectedProject.name,
            role: "ADMIN",
          },
          // VIEWER lacks automations:CUD -> must be excluded
          { id: "viewer-project-id", name: "viewer", role: "VIEWER" },
        ]),
      );

      const res = await caller.slack.getConnectableProjects();
      const orgEntry = res.find((o) => o.orgId === org.id);
      expect(orgEntry).toBeDefined();

      const byId = new Map(orgEntry!.projects.map((p) => [p.projectId, p]));
      expect(byId.get(connectedProject.id)?.isConnected).toBe(true);
      expect(byId.get(unconnectedProject.id)?.isConnected).toBe(false);
      expect(byId.has("viewer-project-id")).toBe(false);
    });
  });

  describe("linkPendingInstallation", () => {
    it("links a pending install to the project", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );
      const teamId = uniqueTeamId("link");
      await createPendingRow(teamId, "Linked WS");

      const res = await caller.slack.linkPendingInstallation({
        projectId: project.id,
        teamId,
        claim: CLAIM_TOKEN,
      });
      expect(res).toEqual({ success: true, teamId, teamName: "Linked WS" });

      const row = await prisma.slackIntegration.findUnique({
        where: { projectId: project.id },
      });
      expect(row?.teamId).toBe(teamId);
      expect(row?.expiresAt).toBeNull();
    });

    it("throws NOT_FOUND when there is no pending install", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );

      await expect(
        caller.slack.linkPendingInstallation({
          projectId: project.id,
          teamId: uniqueTeamId("missing"),
          claim: CLAIM_TOKEN,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the claim token does not match", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "ADMIN" },
        ]),
      );
      const teamId = uniqueTeamId("wrong-link-claim");
      await createPendingRow(teamId);

      await expect(
        caller.slack.linkPendingInstallation({
          projectId: project.id,
          teamId,
          claim: "wrong-claim",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      const row = await prisma.slackIntegration.findUnique({
        where: { projectId: project.id },
      });
      expect(row).toBeNull();
    });

    it("denies users without automations:CUD on the project", async () => {
      const { project, org } = await createOrgProjectAndApiKey();
      // VIEWER role -> automations:read only, no CUD
      const caller = callerFor(
        buildSession(org, [
          { id: project.id, name: project.name, role: "VIEWER" },
        ]),
      );
      const teamId = uniqueTeamId("denied");
      await createPendingRow(teamId);

      await expect(
        caller.slack.linkPendingInstallation({
          projectId: project.id,
          teamId,
          claim: CLAIM_TOKEN,
        }),
      ).rejects.toBeInstanceOf(TRPCError);

      // nothing was linked
      const row = await prisma.slackIntegration.findUnique({
        where: { projectId: project.id },
      });
      expect(row).toBeNull();
    });
  });
});
