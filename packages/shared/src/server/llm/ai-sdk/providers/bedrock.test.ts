import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../../../env";
import {
  BEDROCK_ROLE_PERMISSION_POLICY,
  BEDROCK_USE_DEFAULT_CREDENTIALS,
} from "../../../../interfaces/customLLMProviderConfigSchemas";

const fromNodeProviderChain = vi.hoisted(() => vi.fn(() => vi.fn()));
const findProject = vi.hoisted(() => vi.fn());
const getStorageRoleCredentialsProvider = vi.hoisted(() =>
  vi.fn(() => async () => ({
    accessKeyId: "ASIA123",
    secretAccessKey: "secret",
    sessionToken: "session",
  })),
);

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain,
}));
vi.mock("../../../../db", () => ({
  prisma: { project: { findUnique: findProject } },
}));
vi.mock("../../../../encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../encryption")>()),
  decrypt: (value: string) => value.replace(/^encrypted:/, ""),
}));
vi.mock("../../../ee/storageRoleAuth/storageRoleCredentials", () => ({
  getStorageRoleCredentialsProvider,
}));

import { OutboundUrlValidationError } from "../../../outbound-url/validation";
import {
  assertValidBedrockRegion,
  buildBedrockModel,
  resolveBedrockProviderAuth,
  translateBedrockProviderOptions,
} from "./bedrock";

describe("translateBedrockProviderOptions", () => {
  it("returns undefined for empty input", () => {
    expect(translateBedrockProviderOptions(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(translateBedrockProviderOptions({})).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("wraps options verbatim as additionalModelRequestFields", () => {
    expect(
      translateBedrockProviderOptions({
        thinking: { type: "enabled", budget_tokens: 1024 },
        top_k: 10,
      }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: {
          thinking: { type: "enabled", budget_tokens: 1024 },
          top_k: 10,
        },
      },
    });
  });

  it("keeps a non-object bedrock key in the verbatim passthrough", () => {
    expect(
      translateBedrockProviderOptions({ bedrock: ["us-east-1"], top_k: 10 }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: { bedrock: ["us-east-1"], top_k: 10 },
      },
    });
  });

  it("merges a nested bedrock object as AI SDK-shaped options", () => {
    expect(
      translateBedrockProviderOptions({
        bedrock: {
          reasoningConfig: { type: "enabled", budgetTokens: 1024 },
        },
        anthropic_beta: ["computer-use-2024-10-22"],
      }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: {
          anthropic_beta: ["computer-use-2024-10-22"],
        },
        reasoningConfig: { type: "enabled", budgetTokens: 1024 },
      },
    });
  });
});

describe("assertValidBedrockRegion", () => {
  it("accepts AWS region identifiers and undefined", () => {
    expect(() => assertValidBedrockRegion("us-east-1")).not.toThrow();
    expect(() => assertValidBedrockRegion("eu-central-1")).not.toThrow();
    expect(() => assertValidBedrockRegion(undefined)).not.toThrow();
  });

  it("rejects host-reshaping regions", () => {
    expect(() =>
      assertValidBedrockRegion("us-east-1.amazonaws.com@attacker.test/"),
    ).toThrow("Invalid Bedrock region");
    expect(() => assertValidBedrockRegion("us-east-1.attacker.test")).toThrow(
      "Invalid Bedrock region",
    );
  });
});

describe("Bedrock profile selection", () => {
  const originalEnv = {
    AWS_PROFILE: env.AWS_PROFILE,
    LANGFUSE_AI_FEATURES_AWS_PROFILE: env.LANGFUSE_AI_FEATURES_AWS_PROFILE,
    LANGFUSE_IN_APP_AGENT_AWS_PROFILE: env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE,
    LANGFUSE_AI_AWS_BEDROCK_REGION: env.LANGFUSE_AI_AWS_BEDROCK_REGION,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  beforeEach(() => {
    fromNodeProviderChain.mockClear();
    env.AWS_PROFILE = undefined;
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = "legacy";
    env.LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-west-1";
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    Object.assign(env, originalEnv);
  });

  it.each([
    ["ai", "langfuse", "ai"],
    [undefined, "langfuse", "legacy"],
    ["ai", "user", undefined],
  ] as const)(
    "AI profile %s with %s credentials selects %s",
    (profile, credentialSource, expected) => {
      env.LANGFUSE_AI_FEATURES_AWS_PROFILE = profile;
      buildBedrockModel({
        modelId: "test-model",
        apiKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        config: { region: "eu-west-1" },
        credentialSource,
      });
      expect(fromNodeProviderChain).toHaveBeenCalledWith(
        expected ? { profile: expected } : {},
      );
    },
  );
});

describe("resolveBedrockProviderAuth", () => {
  it("uses the default credential chain for the sentinel when allowed", () => {
    const auth = resolveBedrockProviderAuth({
      secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
      allowDefaultCredentials: true,
    });
    expect(auth.credentialProvider).toBeTypeOf("function");
    expect(auth.accessKeyId).toBeUndefined();
    // Empty string (not undefined) so the provider never falls back to the
    // server's AWS_BEARER_TOKEN_BEDROCK env var.
    expect(auth.apiKey).toBe("");
  });

  it("rejects the sentinel when default credentials are not allowed", () => {
    expect(() =>
      resolveBedrockProviderAuth({
        secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("maps access key JSON to explicit credentials, suppressing the bearer env fallback", () => {
    expect(
      resolveBedrockProviderAuth({
        secretKey: JSON.stringify({
          accessKeyId: "AKIA123",
          secretAccessKey: "secret",
        }),
        allowDefaultCredentials: false,
      }),
    ).toEqual({
      accessKeyId: "AKIA123",
      secretAccessKey: "secret",
      apiKey: "",
    });
  });

  it("maps a Bedrock API key to bearer auth", () => {
    expect(
      resolveBedrockProviderAuth({
        secretKey: JSON.stringify({ apiKey: "bedrock-key" }),
        allowDefaultCredentials: false,
      }),
    ).toEqual({ apiKey: "bedrock-key" });
  });

  it("rejects malformed credentials", () => {
    expect(() =>
      resolveBedrockProviderAuth({
        secretKey: "not-json",
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("assumes an IAM role with the connection's external ID, limited to model invocation", async () => {
    const roleArn = "arn:aws:iam::123456789012:role/langfuse-bedrock";
    findProject.mockResolvedValue({ orgId: "org-1" });

    const auth = resolveBedrockProviderAuth({
      secretKey: JSON.stringify({ roleArn }),
      allowDefaultCredentials: false,
      projectId: "project-1",
      externalId: "encrypted:lf-external-id",
    });

    expect(auth.apiKey).toBe("");
    await expect(auth.credentialProvider?.()).resolves.toMatchObject({
      sessionToken: "session",
    });
    expect(getStorageRoleCredentialsProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        roleArn,
        externalId: "lf-external-id",
        projectId: "project-1",
        orgId: "org-1",
        sessionPolicy: JSON.stringify(BEDROCK_ROLE_PERMISSION_POLICY),
      }),
    );
  });

  it("assumes an IAM role for an organization without a project", async () => {
    findProject.mockClear();
    getStorageRoleCredentialsProvider.mockClear();

    const auth = resolveBedrockProviderAuth({
      secretKey: JSON.stringify({
        roleArn: "arn:aws:iam::123456789012:role/langfuse-bedrock",
      }),
      allowDefaultCredentials: false,
      organizationId: "org-1",
      externalId: "encrypted:lf-external-id",
    });

    await expect(auth.credentialProvider?.()).resolves.toMatchObject({
      sessionToken: "session",
    });
    expect(findProject).not.toHaveBeenCalled();
    expect(getStorageRoleCredentialsProvider).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: undefined, orgId: "org-1" }),
    );
  });
});

function writeProcessEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("Bedrock LLM host allowlist", () => {
  const originalAllowedHosts = env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const runtimeEndpointEnv = "AWS_ENDPOINT_URL_BEDROCK_RUNTIME";
  const originalRuntimeEndpoint = process.env[runtimeEndpointEnv];

  const userConnection = {
    modelId: "test-model",
    apiKey: JSON.stringify({ apiKey: "bedrock-key" }),
    config: { region: "eu-west-1" },
    credentialSource: "user" as const,
  };

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [];
    writeProcessEnv(runtimeEndpointEnv, undefined);
  });

  afterEach(() => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = originalAllowedHosts;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    writeProcessEnv(
      runtimeEndpointEnv,
      typeof originalRuntimeEndpoint === "string"
        ? originalRuntimeEndpoint
        : undefined,
    );
  });

  it("allows the region host only when it is listed", () => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["litellm.corp"];
    expect(() => buildBedrockModel(userConnection)).toThrow(
      OutboundUrlValidationError,
    );

    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ];
    expect(() => buildBedrockModel(userConnection)).not.toThrow();
  });

  it("checks the Bedrock endpoint override instead of the region host", () => {
    writeProcessEnv(runtimeEndpointEnv, "https://vpce.internal/bedrock");
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ];
    expect(() => buildBedrockModel(userConnection)).toThrow(
      OutboundUrlValidationError,
    );

    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["vpce.internal"];
    expect(() => buildBedrockModel(userConnection)).not.toThrow();
  });

  it("ignores the allowlist on Langfuse Cloud", () => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["litellm.corp"];

    expect(() => buildBedrockModel(userConnection)).not.toThrow();
  });
});
