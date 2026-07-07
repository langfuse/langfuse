import {
  createLocalSandboxSnapshotStore,
  createS3SandboxSnapshotStore,
} from "./snapshots";
import { createDockerSandboxProvider } from "./providers/docker";
import { createLambdaMicrovmSandboxProvider } from "./providers/lambdaMicrovm";
import type { InAppAgentSandboxProviderType } from "./types";
import { env } from "@/src/env.mjs";
import { IN_APP_AGENT_LOCAL_SANDBOX_IMAGE } from "@/src/ee/features/in-app-agent/constants";
import { assertUnreachable } from "@/src/utils/types";

export function getDefaultInAppAgentSandboxProviderType(): InAppAgentSandboxProviderType {
  return (
    env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER ??
    (env.NODE_ENV === "development" ? "dangerous-docker" : "lambda-microvm")
  );
}

export function getInAppAgentSandboxSnapshotStore(
  providerType: InAppAgentSandboxProviderType,
) {
  if (providerType === "dangerous-docker") {
    return createLocalSandboxSnapshotStore({
      baseDir: env.LANGFUSE_IN_APP_AGENT_SANDBOX_LOCAL_SNAPSHOT_DIR,
    });
  }

  if (providerType === "lambda-microvm") {
    if (!env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET) {
      return {
        deleteSnapshot: async () => undefined,
        getSnapshot: async () => null,
        putSnapshot: async () => undefined,
      };
    }

    return createS3SandboxSnapshotStore({
      accessKeyId: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID,
      bucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
      endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ENDPOINT,
      forcePathStyle:
        env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_FORCE_PATH_STYLE === "true",
      prefix: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX,
      region: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION,
      secretAccessKey:
        env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY,
    });
  }

  assertUnreachable(providerType);
}

export async function deleteInAppAgentSandboxSnapshot(params: {
  providerType: InAppAgentSandboxProviderType;
  snapshotKey: string;
  sessionId?: string | null;
}) {
  const provider = createInAppAgentSandboxProvider(params.providerType);

  if (params.sessionId && provider?.terminateSession) {
    await provider.terminateSession({ sessionId: params.sessionId });
  }

  const store = getInAppAgentSandboxSnapshotStore(params.providerType);
  await store.deleteSnapshot(params.snapshotKey);
}

export function createInAppAgentSandboxProvider(
  providerType: InAppAgentSandboxProviderType,
) {
  if (providerType === "dangerous-docker") {
    return createDockerSandboxProvider({
      image: IN_APP_AGENT_LOCAL_SANDBOX_IMAGE,
      snapshotStore: getInAppAgentSandboxSnapshotStore(providerType),
    });
  }

  if (providerType === "lambda-microvm") {
    if (
      !env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER
    ) {
      throw new Error(
        "LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER is required for lambda-microvm sandboxes.",
      );
    }

    return createLambdaMicrovmSandboxProvider({
      endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_ENDPOINT,
      imageIdentifier:
        env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER,
      executionRoleArn:
        env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_EXECUTION_ROLE_ARN,
    });
  }

  assertUnreachable(providerType);
}
