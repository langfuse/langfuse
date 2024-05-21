import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";

export async function createProjectMembershipsOnSignup(user: {
  id: string;
  email: string | null;
}) {
  try {
    // Langfuse Cloud: Demo project access via demo org
    const demoOrgId = env.NEXT_PUBLIC_DEMO_ORG_ID
      ? (
          await prisma.organization.findUnique({
            where: {
              id: env.NEXT_PUBLIC_DEMO_ORG_ID,
            },
          })
        )?.id
      : undefined;
    if (demoOrgId !== undefined) {
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          orgId: demoOrgId,
          role: "NONE",
        },
      });
    }

    // set default project access
    const defaultProjectID = env.LANGFUSE_DEFAULT_PROJECT_ID
      ? (
          await prisma.project.findUnique({
            where: {
              id: env.LANGFUSE_DEFAULT_PROJECT_ID,
            },
          })
        )?.id
      : undefined;
    if (defaultProjectID !== undefined) {
      await prisma.projectMembership.create({
        data: {
          projectId: defaultProjectID,
          userId: user.id,
          role: env.LANGFUSE_DEFAULT_PROJECT_ROLE ?? "VIEWER",
        },
      });
    }
    // Invites do not work for users without emails (some future SSO users)
    if (user.email) await processMembershipInvitations(user.email, user.id);
  } catch (e) {
    console.error("Error assigning project access to new user", e);
  }
}

async function processMembershipInvitations(email: string, userId: string) {
  const invitationsForUser = await prisma.membershipInvitation.findMany({
    where: {
      email: email.toLowerCase(),
    },
  });
  console.log("invitationsForUser", invitationsForUser);
  if (invitationsForUser.length === 0) return;

  // Map to individual payloads instead of using createMany as we can thereby use nested writes for ProjectMemberships
  const createOrgMembershipData = invitationsForUser
    //.filter((invitation) => invitation.orgId !== null) // TODO: drop this filter when we have orgId in all invitations
    .map((invitation) => ({
      userId: userId,
      orgId: invitation.orgId as string, // TODO: drop the as string when we have orgId in all invitations
      role: invitation.orgRole,
      defaultProjectRole: invitation.defaultProjectRole,
      ...(invitation.projectId && invitation.projectRole
        ? {
            ProjectMemberships: {
              create: {
                userId: userId,
                projectId: invitation.projectId,
                role: invitation.projectRole,
              },
            },
          }
        : {}),
    }));

  console.log("createOrgMembershipData", createOrgMembershipData);

  const createOrgMembershipsPromises = createOrgMembershipData.map(
    (inviteData) => prisma.organizationMembership.create({ data: inviteData }),
  );

  await prisma.$transaction([
    ...createOrgMembershipsPromises,
    prisma.membershipInvitation.deleteMany({
      where: {
        id: {
          in: invitationsForUser.map((invitation) => invitation.id),
        },
        email: email.toLowerCase(),
      },
    }),
  ]);
}
