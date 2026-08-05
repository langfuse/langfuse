import { createLambdaMicrovmSandboxProvider } from "./providers/lambdaMicrovm";
import type { InAppAgentSandboxProviderType, SandboxProvider } from "./types";
import { env } from "../../../env";
import { IN_APP_AGENT_LOCAL_SANDBOX_IMAGE } from "../../constants";
import { assertUnreachable } from "../../../utils/typeChecks";

export function getDefaultInAppAgentSandboxProviderType(): InAppAgentSandboxProviderType | null {
  const providerType = env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER ?? null;

  if (providerType === null) {
    return null;
  }

  // Vitest loads the developer's ../.env (web/vitest.config.mts,
  // worker/vitest.config.ts), so a locally configured provider would otherwise
  // spawn real sandboxes during tests. Key off Vitest's own signal rather than
  // NODE_ENV: NODE_ENV is ambient and deploy-settable, and a deployment that
  // set it to "test" silently stripped the agent's sandbox tools instead.
  if (process.env.VITEST) {
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
