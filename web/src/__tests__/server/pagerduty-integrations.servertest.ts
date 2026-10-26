import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import {
  GetPagerDutyIntegrationsV1Response,
  PagerDutyIntegrationResponse,
} from "@/src/features/public-api/types/pagerduty-integrations";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { decrypt } from "@langfuse/shared/encryption";
import { prisma, type Role } from "@langfuse/shared/src/db";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import type { Session } from "next-auth";
import { v4 } from "uuid";

const routingKey = "R0abcdefghijklmnopqrstuvwxyz9xYz";
const rotatedRoutingKey = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

async function prepare(projectRole: Role = "ADMIN") {
  const { project, org, auth } = await createOrgProjectAndApiKey();
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
          role: "MEMBER",
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
              hasTraces: false,
              name: project.name,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };
  const caller = appRouter.createCaller({
    ...createInnerTRPCContext({ session, headers: {} }),
    prisma,
  });
  return { project, auth, caller };
}

async function createAutomationUsing(
  projectId: string,
  pagerDutyIntegrationId: string,
) {
  const trigger = await prisma.trigger.create({
    data: {
      projectId,
      eventSource: "monitor",
      eventActions: [],
      filter: [],
    },
  });
  const action = await prisma.action.create({
    data: {
      projectId,
      type: "PAGERDUTY",
      config: { type: "PAGERDUTY", pagerDutyIntegrationId },
    },
  });
  return prisma.automation.create({
    data: {
      projectId,
      triggerId: trigger.id,
      actionId: action.id,
      name: `Page on-call ${v4()}`,
    },
  });
}

describe("PagerDuty integrations", () => {
  describe("/api/public/integrations/pagerduty", () => {
    it("creates, lists, updates and deletes a routing key without returning it", async () => {
      const { project, auth } = await prepare();

      const created = await makeZodVerifiedAPICall(
        PagerDutyIntegrationResponse,
        "POST",
        "/api/public/integrations/pagerduty",
        { name: "On-call", routingKey },
        auth,
        201,
      );
      expect(created.body).toEqual({
        id: expect.any(String),
        name: "On-call",
        displayRoutingKey: "R0ab...9xYz",
        region: "US",
      });

      const stored = await prisma.pagerDutyIntegration.findUniqueOrThrow({
        where: { id: created.body.id },
        omit: { routingKey: false },
      });
      expect(stored.routingKey).not.toBe(routingKey);
      expect(decrypt(stored.routingKey)).toBe(routingKey);

      const listed = await makeZodVerifiedAPICall(
        GetPagerDutyIntegrationsV1Response,
        "GET",
        "/api/public/integrations/pagerduty",
        undefined,
        auth,
      );
      expect(listed.body.data).toEqual([created.body]);
      expect(JSON.stringify(listed.body)).not.toContain(routingKey);

      const updated = await makeZodVerifiedAPICall(
        PagerDutyIntegrationResponse,
        "PATCH",
        `/api/public/integrations/pagerduty/${created.body.id}`,
        { name: "EU on-call", routingKey: rotatedRoutingKey, region: "EU" },
        auth,
      );
      expect(updated.body).toEqual({
        id: created.body.id,
        name: "EU on-call",
        displayRoutingKey: "a1b2...c5d6",
        region: "EU",
      });

      const deleted = await makeAPICall(
        "DELETE",
        `/api/public/integrations/pagerduty/${created.body.id}`,
        undefined,
        auth,
      );
      expect(deleted.status).toBe(200);
      expect(
        await prisma.pagerDutyIntegration.count({
          where: { projectId: project.id },
        }),
      ).toBe(0);
    });

    it("rejects deleting a routing key in use with the automations using it", async () => {
      const { project, auth } = await prepare();
      const integration = await prisma.pagerDutyIntegration.create({
        data: {
          projectId: project.id,
          name: "On-call",
          routingKey: "encrypted",
          displayRoutingKey: "R0ab...9xYz",
        },
      });
      const automation = await createAutomationUsing(
        project.id,
        integration.id,
      );

      const response = await makeAPICall(
        "DELETE",
        `/api/public/integrations/pagerduty/${integration.id}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        automations: [{ id: automation.id, name: automation.name }],
      });
    });

    it("rejects a malformed routing key", async () => {
      const { auth } = await prepare();

      const response = await makeAPICall(
        "POST",
        "/api/public/integrations/pagerduty",
        { name: "On-call", routingKey: "too-short" },
        auth,
      );

      expect(response.status).toBe(400);
    });

    it("does not touch routing keys of another project", async () => {
      const { auth } = await prepare();
      const { project: otherProject } = await prepare();
      const otherIntegration = await prisma.pagerDutyIntegration.create({
        data: {
          projectId: otherProject.id,
          name: "On-call",
          routingKey: "encrypted",
          displayRoutingKey: "R0ab...9xYz",
        },
      });

      const response = await makeAPICall(
        "DELETE",
        `/api/public/integrations/pagerduty/${otherIntegration.id}`,
        undefined,
        auth,
      );

      expect(response.status).toBe(404);
      expect(
        await prisma.pagerDutyIntegration.findUnique({
          where: { id: otherIntegration.id },
        }),
      ).not.toBeNull();
    });
  });

  describe("pagerDuty tRPC router", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("lets a VIEWER list keys but not create them", async () => {
      const { project, caller } = await prepare("VIEWER");

      await expect(
        caller.pagerDuty.list({ projectId: project.id }),
      ).resolves.toEqual([]);
      await expect(
        caller.pagerDuty.create({
          projectId: project.id,
          name: "On-call",
          routingKey,
          region: "US",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects a duplicate name and audit-logs the create", async () => {
      const { project, caller } = await prepare();

      const created = await caller.pagerDuty.create({
        projectId: project.id,
        name: "On-call",
        routingKey,
        region: "US",
      });
      await expect(
        caller.pagerDuty.create({
          projectId: project.id,
          name: "On-call",
          routingKey,
          region: "US",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          projectId: project.id,
          resourceType: "pagerDutyIntegration",
          resourceId: created.id,
          action: "create",
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.after).not.toContain(routingKey);
    });

    it("rejects deleting a key that automations use", async () => {
      const { project, caller } = await prepare();
      const created = await caller.pagerDuty.create({
        projectId: project.id,
        name: "On-call",
        routingKey,
        region: "US",
      });
      await createAutomationUsing(project.id, created.id);

      await expect(
        caller.pagerDuty.delete({ projectId: project.id, id: created.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("sends a test event as a trigger and a resolve with the same dedup key", async () => {
      const { project, caller } = await prepare();
      const created = await caller.pagerDuty.create({
        projectId: project.id,
        name: "On-call",
        routingKey,
        region: "EU",
      });
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("{}", { status: 202 }));

      await caller.pagerDuty.sendTestEvent({
        projectId: project.id,
        id: created.id,
      });

      const requests = fetchSpy.mock.calls.map(([url, init]) => ({
        url: String(url),
        body: JSON.parse(String(init?.body)),
      }));
      expect(requests.map((request) => request.url)).toEqual([
        "https://events.eu.pagerduty.com/v2/enqueue",
        "https://events.eu.pagerduty.com/v2/enqueue",
      ]);
      expect(requests.map((request) => request.body.event_action)).toEqual([
        "trigger",
        "resolve",
      ]);
      expect(requests[0].body.routing_key).toBe(routingKey);
      expect(requests[1].body.dedup_key).toBe(requests[0].body.dedup_key);
    });

    it("surfaces a rejected test event as a bad request", async () => {
      const { project, caller } = await prepare();
      const created = await caller.pagerDuty.create({
        projectId: project.id,
        name: "On-call",
        routingKey,
        region: "US",
      });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response('{"status":"invalid event"}', { status: 400 }),
      );

      await expect(
        caller.pagerDuty.sendTestEvent({
          projectId: project.id,
          id: created.id,
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("requires automations:CUD to send a test event", async () => {
      const { project, caller } = await prepare("MEMBER");
      const integration = await prisma.pagerDutyIntegration.create({
        data: {
          projectId: project.id,
          name: "On-call",
          routingKey: "encrypted",
          displayRoutingKey: "R0ab...9xYz",
        },
      });

      await expect(
        caller.pagerDuty.sendTestEvent({
          projectId: project.id,
          id: integration.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
