import { v4 } from "uuid";
import { prisma } from "../../db";
import { hashSecretKey, getDisplaySecretKey } from "../auth/apiKeys";
import { CloudConfigSchema } from "../../interfaces/cloudConfigSchema";

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
        plan: "Team",
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
  const publicKey = v4();
  const secretKey = v4();

  const auth = createBasicAuthHeader(publicKey, secretKey);
  await prisma.apiKey.create({
    data: {
      id: v4(),
      projectId: projectId,
      publicKey: publicKey,
      hashedSecretKey: await hashSecretKey(secretKey),
      displaySecretKey: getDisplaySecretKey(secretKey),
      scope: "PROJECT",
    },
  });

  return { projectId, orgId: org.id, publicKey, secretKey, auth, org, project };
};
