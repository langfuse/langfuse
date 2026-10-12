import { createLambdaMicrovmSandboxProvider } from "./providers/lambdaMicrovm";
import type { InAppAgentSandboxProviderType, SandboxProvider } from "./types";
import { env } from "../../../../env";
import { assertUnreachable } from "@langfuse/shared";

const IN_APP_AGENT_LOCAL_SANDBOX_IMAGE = "langfuse-in-app-agent-sandbox:latest";

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

/**
 * Whether deployment config gives the guest a restricted outbound network.
 * Lambda MicroVMs get open internet unless an egress connector is attached;
 * the local Docker provider runs without a network. This only checks that the
 * connector is configured: what its network can reach is infrastructure config.
 */
export function hasInAppAgentSandboxEgressRestriction(
  providerType: InAppAgentSandboxProviderType,
): boolean {
  if (providerType === "dangerous-docker") return true;
  if (providerType === "lambda-microvm") {
    return Boolean(
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_EGRESS_NETWORK_CONNECTOR_ARN,
    );
  }
  assertUnreachable(providerType);
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
    const { createDockerSandboxProvider } =
      await import("./providers/docker.js");
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
