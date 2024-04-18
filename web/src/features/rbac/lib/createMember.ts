import {
  type AuditLogSource,
  auditLog,
} from "@/src/features/audit-logs/auditLog";
import { sendProjectInvitation } from "@/src/features/email/lib/project-invitation";
import { MembershipRole, prisma as _prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

// directly used as API interfaces
export const CreateMemberInput = z.object({
  projectId: z.string(),
  email: z.string().email(),
  role: z.enum([
    MembershipRole.ADMIN,
    MembershipRole.MEMBER,
    MembershipRole.VIEWER,
  ]),
});
export type CreateMemberInput = z.infer<typeof CreateMemberInput>;

const Sender = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});
type Sender = z.infer<typeof Sender>;

export async function createNewMember(p: {
  newMember: CreateMemberInput;
  sender?: Sender;
  prisma?: typeof _prisma;
  auditLogSource: AuditLogSource;
}) {
  const parsedNewMember = CreateMemberInput.parse(p.newMember);
  const parsedSender = Sender.parse(p.sender);

  // check if user exists
  const user = await (p.prisma ?? _prisma).user.findUnique({
    where: {
      email: parsedNewMember.email.toLowerCase(),
    },
  });
  // if user exists, create membership
  if (user) {
    // check if user already has access
    const existingMembership = await (p.prisma ?? _prisma).membership.findFirst(
      {
        where: {
          userId: user.id,
          projectId: parsedNewMember.projectId,
        },
      },
    );
    if (existingMembership) {
      throw new Error("User is already member of this project");
    }

    const membership = await (p.prisma ?? _prisma).membership.create({
      data: {
        userId: user.id,
        projectId: parsedNewMember.projectId,
        role: parsedNewMember.role,
      },
    });
    await auditLog({
      resourceType: "membership",
      resourceId: parsedNewMember.projectId + "--" + user.id,
      action: "create",
      after: membership,
      ...p.auditLogSource,
    });
    return membership;
  } else {
    // if user does not exist, create invitation
    const invitation = await (p.prisma ?? _prisma).membershipInvitation.create({
      data: {
        projectId: parsedNewMember.projectId,
        email: parsedNewMember.email.toLowerCase(),
        role: parsedNewMember.role,
        senderId: parsedSender?.id ?? null,
      },
    });
    await auditLog({
      resourceType: "membershipInvitation",
      resourceId: invitation.id,
      action: "create",
      after: invitation,
      ...p.auditLogSource,
    });

    const project = await (p.prisma ?? _prisma).project.findFirst({
      select: {
        name: true,
      },
      where: {
        id: parsedNewMember.projectId,
      },
    });

    if (!project) throw new Error("Project not found");

    await sendProjectInvitation(
      parsedNewMember.email,
      parsedSender?.name ?? null,
      parsedSender?.email ?? null,
      project.name,
    );

    return invitation;
  }
}
