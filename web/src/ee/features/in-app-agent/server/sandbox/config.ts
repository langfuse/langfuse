import { createLambdaMicrovmSandboxProvider } from "./providers/lambdaMicrovm";
import type { InAppAgentSandboxProviderType, SandboxProvider } from "./types";
import { env } from "@/src/env.mjs";
import { IN_APP_AGENT_LOCAL_SANDBOX_IMAGE } from "@/src/ee/features/in-app-agent/constants";
import { assertUnreachable } from "@/src/utils/types";

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

export async function createInAppAgentSandboxProvider(
  providerType: InAppAgentSandboxProviderType,
): Promise<SandboxProvider> {
  if (providerType === "dangerous-docker") {
    if (env.NODE_ENV !== "development") {
      throw new Error(
        "The dangerous-docker in-app agent sandbox provider is only supported in development.",
      );
    }

    // Keep the Docker provider behind a runtime import since it's only used in development
    const { createDockerSandboxProvider } = await import("./providers/docker");
    return createDockerSandboxProvider({
      image: IN_APP_AGENT_LOCAL_SANDBOX_IMAGE,
    });
  }

  if (providerType === "lambda-microvm") {
    const microvmImageIdentifier =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_IMAGE_IDENTIFIER;
    const microvmExecutionRoleArn =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_EXECUTION_ROLE_ARN;
    const microvmEgressNetworkConnectorArn =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_EGRESS_NETWORK_CONNECTOR_ARN;
    const microvmRegion =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_REGION;

    if (!microvmImageIdentifier || !microvmExecutionRoleArn || !microvmRegion) {
      throw new Error(
        "Invalid lambda-microvm sandbox config: image identifier, execution role ARN, and region are required.",
      );
    }

    return createLambdaMicrovmSandboxProvider({
      imageIdentifier: microvmImageIdentifier,
      executionRoleArn: microvmExecutionRoleArn,
      egressNetworkConnectorArn: microvmEgressNetworkConnectorArn,
      region: microvmRegion,
    });
  }

  assertUnreachable(providerType);
}
