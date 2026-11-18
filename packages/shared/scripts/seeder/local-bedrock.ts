import { existsSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "../../src/encryption";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../src/interfaces/customLLMProviderConfigSchemas";

const PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const PROVIDER = "Bedrock Playground EU (IAM)";
const MODELS = [
  "eu.anthropic.claude-sonnet-5-5",
  "eu.anthropic.claude-opus-5-5",
  "eu.anthropic.claude-haiku-5-5",
  "eu.cohere.embed-v4:0",
];

/** A Cloud region alone cannot identify a preview's separate seed process. */
export function assertLocalBedrockSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (
    environment.NODE_ENV === "production" ||
    [
      "CI",
      "GITHUB_ACTIONS",
      "GITLAB_CI",
      "BUILDKITE",
      "CIRCLECI",
      "TF_BUILD",
      "JENKINS_URL",
      "TEAMCITY_VERSION",
    ].some((key) => Boolean(environment[key])) ||
    Object.keys(environment).some(
      (key) => key.startsWith("KUBERNETES_") && environment[key],
    ) ||
    existsSync("/var/run/secrets/kubernetes.io/serviceaccount") ||
    (environment.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
      environment.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV")
  ) {
    throw new Error(
      "Local Bedrock seeding is disabled in production, CI, and Kubernetes.",
    );
  }

  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = environment[key];
    if (key === "DIRECT_URL" && value === undefined) continue;
    let url: URL;
    try {
      url = new URL(value ?? "");
    } catch {
      throw new Error(`Local Bedrock seeding requires a valid local ${key}.`);
    }
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.searchParams.has("host") ||
      url.searchParams.has("hostaddr")
    ) {
      throw new Error(
        `Local Bedrock seeding requires a loopback PostgreSQL ${key} without host overrides.`,
      );
    }
  }
}

export async function seedLocalBedrockConnection(
  prisma: PrismaClient,
  environment: Readonly<Record<string, string | undefined>>,
) {
  assertLocalBedrockSeedEnvironment(environment);
  const where = {
    projectId_provider: { projectId: PROJECT_ID, provider: PROVIDER },
  };
  const existing = await prisma.llmApiKeys.findUnique({ where });
  if (
    existing &&
    (existing.adapter !== "bedrock" ||
      decrypt(existing.secretKey) !== BEDROCK_USE_DEFAULT_CREDENTIALS ||
      !existing.config ||
      typeof existing.config !== "object" ||
      !("region" in existing.config) ||
      existing.config.region !== "eu-west-1")
  ) {
    throw new Error(
      `Refusing to overwrite the existing ${PROVIDER} connection with different credentials or region.`,
    );
  }
  const customModels = [
    ...new Set([...(existing?.customModels ?? []), ...MODELS]),
  ];
  return prisma.llmApiKeys.upsert({
    where,
    create: {
      projectId: PROJECT_ID,
      provider: PROVIDER,
      adapter: "bedrock",
      secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
      displaySecretKey: "IAM default credentials",
      config: { region: "eu-west-1" },
      withDefaultModels: false,
      customModels,
    },
    update: { customModels },
    select: { id: true, provider: true, customModels: true },
  });
}
