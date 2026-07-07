import { deleteLambdaMicrovmInAppAgentSandboxSnapshot } from "@langfuse/shared/src/server";

import { env } from "../../env";

export async function deleteInAppAgentSandboxSnapshot(params: {
  sandboxProvider: string | null;
  snapshotKey: string;
  sessionId?: string | null;
}) {
  if (params.sandboxProvider !== "lambda-microvm") {
    return;
  }

  await deleteLambdaMicrovmInAppAgentSandboxSnapshot({
    endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_ENDPOINT,
    sessionId: params.sessionId,
    snapshotAccessKeyId:
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID,
    snapshotBucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
    snapshotForcePathStyle:
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_FORCE_PATH_STYLE === "true",
    snapshotKey: params.snapshotKey,
    snapshotPrefix: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX,
    snapshotRegion: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION,
    snapshotSecretAccessKey:
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY,
  });
}
