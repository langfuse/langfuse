// Seeds one organization, one gateway ingestion project, an OpenAI provider
// connection and a gateway key, mirroring `seedAiGateway` in
// packages/shared/scripts/seeder/seed-postgres.ts. Runs inside the worker image
// (mounted under /app/worker so @langfuse/shared resolves from its node_modules).
//
// Env: BENCH_INGESTION_MODE (USAGE | FULL), BENCH_GATEWAY_SECRET_KEY.

const { prisma } = require("@langfuse/shared/src/db");
const { encrypt } = require("@langfuse/shared/encryption");
const {
  createApiKey,
  getDisplaySecretKey,
} = require("@langfuse/shared/src/server/auth/apiKeys");
const {
  OrganizationId,
  SystemRoleId,
  UserId,
} = require("@langfuse/shared/rbac");

const ORG_ID = "bench-org";
const USER_ID = "bench-user";
const PROJECT_ID = "bench-gateway-ingestion";
const CONNECTION_ID = "bench-openai";
const PUBLIC_KEY = "pk-lf-gateway-bench";
const SECRET_KEY =
  process.env.BENCH_GATEWAY_SECRET_KEY ?? "sk-lf-gateway-bench";
const INGESTION_MODE = process.env.BENCH_INGESTION_MODE ?? "USAGE";

async function main() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: "bench@example.com", name: "Benchmark" },
    update: {},
  });
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, name: "Gateway benchmark" },
    update: {},
  });
  const membership = await prisma.organizationMembership.upsert({
    where: { orgId_userId: { orgId: ORG_ID, userId: USER_ID } },
    create: { orgId: ORG_ID, userId: USER_ID, role: "OWNER" },
    update: {},
  });
  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    create: { id: PROJECT_ID, name: "Gateway ingestion", orgId: ORG_ID },
    update: {},
  });
  await prisma.projectMembership.upsert({
    where: { projectId_userId: { projectId: PROJECT_ID, userId: USER_ID } },
    create: {
      projectId: PROJECT_ID,
      userId: USER_ID,
      orgMembershipId: membership.id,
      role: "OWNER",
    },
    update: {},
  });
  await prisma.gatewayConfig.upsert({
    where: { organizationId: ORG_ID },
    create: {
      organizationId: ORG_ID,
      defaultIngestionProjectId: PROJECT_ID,
      ingestionMode: INGESTION_MODE,
    },
    update: {
      defaultIngestionProjectId: PROJECT_ID,
      ingestionMode: INGESTION_MODE,
    },
  });
  // The mock upstream ignores the credential; the gateway still sends it.
  const credential = "sk-bench-upstream-not-a-real-key";
  await prisma.gatewayAiConnection.upsert({
    where: { id: CONNECTION_ID },
    create: {
      id: CONNECTION_ID,
      organizationId: ORG_ID,
      name: "OpenAI (mock upstream)",
      provider: "OPENAI",
      encryptedCredential: encrypt(credential),
      displaySecret: getDisplaySecretKey(credential),
      createdById: USER_ID,
      status: "ENABLED",
    },
    update: { status: "ENABLED" },
  });

  const existing = await prisma.apiKey.findUnique({
    where: { publicKey: PUBLIC_KEY },
    select: { id: true },
  });
  const key =
    existing ??
    (await createApiKey(prisma, {
      tenant: OrganizationId(ORG_ID),
      scope: UserId(USER_ID),
      role: SystemRoleId("AI_GATEWAY"),
      createdBy: UserId(USER_ID),
      name: "Benchmark gateway key",
      predefinedKeys: { publicKey: PUBLIC_KEY, secretKey: SECRET_KEY },
    }));
  await prisma.gatewayApiKeyAssociation.upsert({
    where: { apiKeyId: key.id },
    create: { apiKeyId: key.id, metadata: { purpose: "benchmark" } },
    update: {},
  });
  console.log(
    JSON.stringify({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      ingestionMode: INGESTION_MODE,
      gatewayKey: SECRET_KEY,
    }),
  );
}

// The shared server modules open Redis connections on import; exit explicitly.
main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
