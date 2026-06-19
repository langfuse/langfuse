import { prisma } from "@langfuse/shared/src/db";
import { encrypt } from "@langfuse/shared/encryption";
import {
  SlackService,
  createOrgProjectAndApiKey,
  hashSlackPendingInstallClaimToken,
} from "@langfuse/shared/src/server";

const CLAIM_TOKEN = "test-claim-token";
const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000);
const pastExpiry = () => new Date(Date.now() - 60 * 1000);

/** Unique team id per call so parallel/repeat runs don't collide. */
let teamCounter = 0;
const uniqueTeamId = (label: string) =>
  `T-${Date.now()}-${teamCounter++}-${label}`;

async function createPendingRow(
  teamId: string,
  opts?: { expiresAt?: Date; teamName?: string; claimToken?: string },
) {
  return prisma.slackIntegration.create({
    data: {
      projectId: null,
      teamId,
      teamName: opts?.teamName ?? "Test Workspace",
      botToken: encrypt("xoxb-test-token"),
      botUserId: "U-test",
      expiresAt: opts?.expiresAt ?? futureExpiry(),
      claimTokenHash: hashSlackPendingInstallClaimToken(
        opts?.claimToken ?? CLAIM_TOKEN,
      ),
    },
  });
}

describe("SlackService pending installations", () => {
  let svc: SlackService;

  beforeAll(() => {
    svc = SlackService.getInstance();
  });

  it("getPendingInstallation returns active pending, null when expired or absent", async () => {
    const teamId = uniqueTeamId("get");
    expect(await svc.getPendingInstallation(teamId)).toBeNull();

    await createPendingRow(teamId, { teamName: "Acme" });
    expect((await svc.getPendingInstallation(teamId))?.teamName).toBe("Acme");

    const expiredTeam = uniqueTeamId("get-expired");
    await createPendingRow(expiredTeam, { expiresAt: pastExpiry() });
    expect(await svc.getPendingInstallation(expiredTeam)).toBeNull();
  });

  it("getClaimedPendingInstallation returns active pending only for the matching claim", async () => {
    const teamId = uniqueTeamId("get-claimed");
    await createPendingRow(teamId, { teamName: "Claimed" });

    expect(
      (await svc.getClaimedPendingInstallation(teamId, CLAIM_TOKEN))?.teamName,
    ).toBe("Claimed");
    expect(
      await svc.getClaimedPendingInstallation(teamId, "wrong-claim"),
    ).toBeNull();
  });

  it("issuePendingInstallationClaim stores a hash and returns the raw token", async () => {
    const teamId = uniqueTeamId("issue-claim");
    await createPendingRow(teamId);

    const claim = await svc.issuePendingInstallationClaim(teamId);
    expect(claim).toEqual(expect.any(String));
    expect(
      await svc.getClaimedPendingInstallation(teamId, claim!),
    ).not.toBeNull();
  });

  it("linkPendingInstallation links the pending install to the project", async () => {
    const { project } = await createOrgProjectAndApiKey();
    const teamId = uniqueTeamId("link");
    await createPendingRow(teamId);

    const linked = await svc.linkPendingInstallation(
      teamId,
      project.id,
      CLAIM_TOKEN,
    );
    expect(linked?.teamId).toBe(teamId);

    const row = await prisma.slackIntegration.findUnique({
      where: { projectId: project.id },
    });
    expect(row?.teamId).toBe(teamId);
    expect(row?.expiresAt).toBeNull();
    expect(row?.claimTokenHash).toBeNull();
    // pending rows for the workspace are consumed
    expect(
      await prisma.slackIntegration.count({
        where: { teamId, projectId: null },
      }),
    ).toBe(0);
  });

  it("linkPendingInstallation replaces an existing integration for the project", async () => {
    const { project } = await createOrgProjectAndApiKey();
    await prisma.slackIntegration.create({
      data: {
        projectId: project.id,
        teamId: uniqueTeamId("old"),
        teamName: "Old",
        botToken: encrypt("x"),
        botUserId: "U1",
      },
    });

    const teamId = uniqueTeamId("link-replace");
    await createPendingRow(teamId, { teamName: "New" });

    const linked = await svc.linkPendingInstallation(
      teamId,
      project.id,
      CLAIM_TOKEN,
    );
    expect(linked?.teamName).toBe("New");

    const rows = await prisma.slackIntegration.findMany({
      where: { projectId: project.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].teamId).toBe(teamId);
  });

  it("linkPendingInstallation returns null when there is no valid pending install", async () => {
    const { project } = await createOrgProjectAndApiKey();
    expect(
      await svc.linkPendingInstallation(
        uniqueTeamId("none"),
        project.id,
        CLAIM_TOKEN,
      ),
    ).toBeNull();
  });

  it("linkPendingInstallation returns null when the claim token is invalid", async () => {
    const { project } = await createOrgProjectAndApiKey();
    const teamId = uniqueTeamId("wrong-claim");
    await createPendingRow(teamId);

    expect(
      await svc.linkPendingInstallation(teamId, project.id, "wrong-claim"),
    ).toBeNull();
  });

  it("deleteExpiredPendingInstallations purges only expired pending rows", async () => {
    const { project } = await createOrgProjectAndApiKey();
    const freshTeam = uniqueTeamId("fresh");
    const expiredTeam = uniqueTeamId("expired");

    await createPendingRow(freshTeam);
    await createPendingRow(expiredTeam, { expiresAt: pastExpiry() });
    await prisma.slackIntegration.create({
      data: {
        projectId: project.id,
        teamId: uniqueTeamId("linked"),
        teamName: "Linked",
        botToken: encrypt("x"),
        botUserId: "U1",
      },
    });

    await svc.deleteExpiredPendingInstallations();

    expect(await svc.getPendingInstallation(freshTeam)).not.toBeNull();
    expect(
      await prisma.slackIntegration.count({ where: { teamId: expiredTeam } }),
    ).toBe(0);
    // Linked integration is never touched by the purge.
    expect(
      await prisma.slackIntegration.count({ where: { projectId: project.id } }),
    ).toBe(1);
  });
});
