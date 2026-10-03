import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

const emailSchema = z.email();

export async function handleGetUserOrganizationsByEmail(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const emailParam = req.query.email;
  if (typeof emailParam !== "string" || emailParam.length === 0) {
    return res.status(400).json({ error: "Invalid email parameter" });
  }

  const normalizedEmail = decodeURIComponent(emailParam).trim().toLowerCase();
  const parsedEmail = emailSchema.safeParse(normalizedEmail);
  if (!parsedEmail.success) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsedEmail.data },
    select: {
      email: true,
      organizationMemberships: {
        select: {
          role: true,
          organization: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              metadata: true,
            },
          },
        },
        orderBy: {
          organization: {
            name: "asc",
          },
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  return res.status(200).json({
    email: user.email,
    organizations: user.organizationMemberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      role: membership.role,
      createdAt: membership.organization.createdAt,
      metadata: membership.organization.metadata ?? {},
    })),
  });
}
