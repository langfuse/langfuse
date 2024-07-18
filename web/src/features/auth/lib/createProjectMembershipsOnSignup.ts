import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";

export async function createProjectMembershipsOnSignup(user: {
  id: string;
  email: string | null;
}) {
  try {
    // Langfuse Cloud: Demo project access
    const demoProjectId = env.NEXT_PUBLIC_DEMO_PROJECT_ID
      ? (
          await prisma.project.findUnique({
            where: {
              id: env.NEXT_PUBLIC_DEMO_PROJECT_ID,
            },
          })
        )?.id
      : undefined;
    if (demoProjectId !== undefined) {
      await prisma.projectMembership.create({
        data: {
          projectId: demoProjectId,
          userId: user.id,
          role: "VIEWER",
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

  if (invitationsForUser.length > 0) {
    const membershipsData = invitationsForUser.map((invitation) => {
      return {
        userId: userId,
        projectId: invitation.projectId,
        role: invitation.role,
      };
    });

    await prisma.$transaction([
      prisma.projectMembership.createMany({
        data: membershipsData,
      }),
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
}
