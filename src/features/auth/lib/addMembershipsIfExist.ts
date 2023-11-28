import { prisma } from "@/src/server/db";

export async function addMembershipsIfExists(email: string, userId: string) {
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
      prisma.membership.createMany({
        data: membershipsData,
      }),
      prisma.membershipInvitation.deleteMany({
        where: {
          email: email.toLowerCase(),
        },
      }),
    ]);
  }
}
