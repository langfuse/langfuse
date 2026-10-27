import { v4 } from "uuid";
import { prisma } from "../../db";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
} from "../../features/rbac/types";
import { CloudConfigSchema } from "../../interfaces/cloudConfigSchema";
import { createApiKey } from "../auth/apiKeys";

export function createBasicAuthHeader(
  username: string,
  password: string,
): string {
  const base64Credentials = Buffer.from(`${username}:${password}`).toString(
    "base64",
  );
  return `Basic ${base64Credentials}`;
}

export type CreateOrgProjectAndApiKeyOptions = {
  projectId?: string;
  plan?: "Team" | "Hobby" | "Core" | "Pro" | "Enterprise";
};

export const createOrgProjectAndApiKey = async (
  props?: CreateOrgProjectAndApiKeyOptions,
) => {
  const projectId = props?.projectId ?? v4();
  const org = await prisma.organization.create({
    data: {
      id: v4(),
      name: v4(),
      cloudConfig: CloudConfigSchema.parse({
        plan: props?.plan ?? "Team",
      }),
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      name: v4(),
      orgId: org.id,
    },
  });
  const { publicKey, secretKey } = await createApiKey(prisma, {
    tenant: OrganizationId(org.id),
    scope: ProjectId(projectId),
    role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
    createdBy: "system",
  });
  const auth = createBasicAuthHeader(publicKey, secretKey);

  return { projectId, orgId: org.id, publicKey, secretKey, auth, org, project };
};
