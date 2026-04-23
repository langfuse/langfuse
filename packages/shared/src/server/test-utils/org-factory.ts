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

// Default org createdAt for test orgs — before V4_DEFAULT_ENABLED_FROM_AT
// so tests use the legacy read path unless explicitly overridden.
const DEFAULT_TEST_ORG_CREATED_AT = new Date("2024-01-01T00:00:00.000Z");

export type CreateOrgProjectAndApiKeyOptions = {
  projectId?: string;
  plan?: "Team" | "Hobby" | "Core" | "Pro" | "Enterprise";
  orgCreatedAt?: Date;
};
export const createOrgProjectAndApiKey = async (
  props?: CreateOrgProjectAndApiKeyOptions,
) => {
  const projectId = props?.projectId ?? v4();
  const org = await prisma.organization.create({
    data: {
      id: v4(),
      name: v4(),
      createdAt: props?.orgCreatedAt ?? DEFAULT_TEST_ORG_CREATED_AT,
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
