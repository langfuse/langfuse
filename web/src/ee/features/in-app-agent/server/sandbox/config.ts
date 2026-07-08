import { createLambdaMicrovmSandboxProvider } from "./providers/lambdaMicrovm";
import type { InAppAgentSandboxProviderType } from "./types";
import { env } from "@/src/env.mjs";
import { IN_APP_AGENT_LOCAL_SANDBOX_IMAGE } from "@/src/ee/features/in-app-agent/constants";
import { deleteLambdaMicrovmInAppAgentSandboxSnapshot } from "@langfuse/shared/src/server";
import { assertUnreachable } from "@/src/utils/types";

export function parseInAppAgentSandboxProviderType(
  providerType: string | null,
): InAppAgentSandboxProviderType | null {
  if (
    providerType === "dangerous-docker" ||
    providerType === "dangerous_docker"
  ) {
    return "dangerous-docker";
  }

  if (providerType === "lambda-microvm" || providerType === "lambda_microvm") {
    return "lambda-microvm";
  }

  return null;
}

export function getDefaultInAppAgentSandboxProviderType(): InAppAgentSandboxProviderType | null {
  const providerType = env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER ?? null;

  if (providerType === null) {
    return null;
  }

  if (providerType === "dangerous-docker" && env.NODE_ENV !== "development") {
    throw new Error(
      "The dangerous-docker in-app agent sandbox provider is only supported in development.",
    );
  }

  return providerType;
}

export async function deleteInAppAgentSandboxSnapshot(params: {
  providerType: InAppAgentSandboxProviderType;
  snapshotKey: string;
  sessionId?: string | null;
}) {
  if (params.providerType === "lambda-microvm") {
    const snapshotBucket = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET;
    const snapshotPrefix = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX;
    const snapshotRegion = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION;

    if (!snapshotBucket || !snapshotPrefix || !snapshotRegion) {
      throw new Error(
        "Invalid lambda-microvm sandbox config: snapshot bucket, snapshot prefix, and snapshot region are required.",
      );
    }

    await deleteLambdaMicrovmInAppAgentSandboxSnapshot({
      sessionId: params.sessionId,
      snapshotBucket,
      snapshotKey: params.snapshotKey,
      snapshotPrefix,
      snapshotRegion,
    });
    return;
  }

  const provider = await createInAppAgentSandboxProvider(params.providerType);

  if (params.sessionId && provider?.terminateSession) {
    await provider.terminateSession({ sessionId: params.sessionId });
  }
}

export async function createInAppAgentSandboxProvider(
  providerType: InAppAgentSandboxProviderType,
) {
  if (providerType === "dangerous-docker") {
    if (env.NODE_ENV !== "development") {
      throw new Error(
        "The dangerous-docker in-app agent sandbox provider is only supported in development.",
      );
    }

    // Keep the Docker provider behind a runtime import since it's only used in development
    const { createDockerSandboxProvider } = await import("./providers/docker");
    return await createDockerSandboxProvider({
      image: IN_APP_AGENT_LOCAL_SANDBOX_IMAGE,
    });
  }

  if (providerType === "lambda-microvm") {
    const microvmImageIdentifier =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER;
    const microvmExecutionRoleArn =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_EXECUTION_ROLE_ARN;
    const snapshotBucket = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET;
    const snapshotPrefix = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX;
    const snapshotRegion = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION;

    if (
      !microvmImageIdentifier ||
      !microvmExecutionRoleArn ||
      !snapshotBucket ||
      !snapshotPrefix ||
      !snapshotRegion
    ) {
      throw new Error(
        "Invalid lambda-microvm sandbox config: image identifier, execution role ARN, snapshot bucket, snapshot prefix, and snapshot region are required.",
      );
    }

    return createLambdaMicrovmSandboxProvider({
      imageIdentifier: microvmImageIdentifier,
      executionRoleArn: microvmExecutionRoleArn,
      snapshotConfig: {
        bucket: snapshotBucket,
        prefix: snapshotPrefix,
        region: snapshotRegion,
      },
    });
  }

  assertUnreachable(providerType);
}
