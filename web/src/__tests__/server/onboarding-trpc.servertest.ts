import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { SurveyName } from "@prisma/client";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

function createSession(args: {
  user: { id: string; email: string | null; name: string | null };
  organizations?: Session["user"]["organizations"];
  canCreateOrganizations?: boolean;
}): Session {
  return {
    expires: "1",
    user: {
      id: args.user.id,
      email: args.user.email,
      name: args.user.name,
      canCreateOrganizations: args.canCreateOrganizations ?? true,
      organizations: args.organizations ?? [],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: null,
    },
  };
}

function createCaller(session: Session) {
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return appRouter.createCaller({ ...ctx, prisma });
}

describe("onboardingRouter.complete", () => {
  it("creates a starter org and project for a user without a real org", async () => {
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `new-user-${uuidv4().slice(0, 8)}@test.com`,
        name: "New User",
      },
    });

    const caller = createCaller(createSession({ user }));

    const result = await caller.onboarding.complete({
      response: {
        role: "Engineer",
        signupReason: "Evaluate Langfuse",
      },
    });

    expect(result.starterOrganizationId).toBeTruthy();
    expect(result.starterProjectId).toBeTruthy();
    expect(result.shouldShowInvitePrompt).toBe(true);

    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: user.id,
        orgId: result.starterOrganizationId ?? undefined,
      },
      include: {
        organization: {
          include: {
            projects: true,
          },
        },
      },
    });

    expect(membership?.organization.name).toBe("My Organization");
    expect(membership?.organization.projects).toHaveLength(1);
    expect(membership?.organization.projects[0]?.id).toBe(
      result.starterProjectId,
    );
    expect(membership?.organization.projects[0]?.name).toBe("My Project");

    const survey = await prisma.survey.findFirst({
      where: {
        userId: user.id,
        surveyName: SurveyName.USER_ONBOARDING,
      },
    });

    expect(survey?.orgId).toBe(result.starterOrganizationId);
    expect(survey?.response).toEqual({
      role: "Engineer",
      signupReason: "Evaluate Langfuse",
    });
  });

  it("does not create a new starter org if the user already has a real org", async () => {
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `existing-user-${uuidv4().slice(0, 8)}@test.com`,
        name: "Existing User",
      },
    });

    const organization = await prisma.organization.create({
      data: {
        id: uuidv4(),
        name: "Existing Organization",
        organizationMemberships: {
          create: {
            userId: user.id,
            role: "OWNER",
          },
        },
      },
    });

    const caller = createCaller(
      createSession({
        user,
        organizations: [],
      }),
    );

    const result = await caller.onboarding.complete({
      response: {
        role: "Founder",
      },
    });

    expect(result.starterOrganizationId).toBeNull();
    expect(result.starterProjectId).toBeNull();
    expect(result.shouldShowInvitePrompt).toBe(false);

    const membershipCount = await prisma.organizationMembership.count({
      where: {
        userId: user.id,
      },
    });
    expect(membershipCount).toBe(1);

    const projectCount = await prisma.project.count({
      where: {
        orgId: organization.id,
      },
    });
    expect(projectCount).toBe(0);

    const survey = await prisma.survey.findFirst({
      where: {
        userId: user.id,
        surveyName: SurveyName.USER_ONBOARDING,
      },
    });
    expect(survey?.orgId).toBe(organization.id);
  });

  it("respects organization creation permissions", async () => {
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `restricted-user-${uuidv4().slice(0, 8)}@test.com`,
        name: "Restricted User",
      },
    });

    const caller = createCaller(
      createSession({
        user,
        canCreateOrganizations: false,
      }),
    );

    const result = await caller.onboarding.complete({
      response: {
        role: "Engineer",
      },
    });

    expect(result.starterOrganizationId).toBeNull();
    expect(result.starterProjectId).toBeNull();
    expect(result.shouldShowInvitePrompt).toBe(false);

    const membershipCount = await prisma.organizationMembership.count({
      where: {
        userId: user.id,
      },
    });
    expect(membershipCount).toBe(0);

    const survey = await prisma.survey.findFirst({
      where: {
        userId: user.id,
        surveyName: SurveyName.USER_ONBOARDING,
      },
    });
    expect(survey?.orgId).toBeNull();
  });
});
