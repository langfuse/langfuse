import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "../../env";

function getDefaultProviderName() {
  return (
    env.LANGFUSE_IN_APP_AGENT_SANDBOX_PROVIDER ??
    (env.NODE_ENV === "development" ? "dangerous-docker" : "lambda-microvm")
  );
}

export async function deleteInAppAgentSandboxSnapshot(params: {
  providerName?: string | null;
  snapshotKey: string;
}) {
  const providerName = params.providerName ?? getDefaultProviderName();

  if (providerName === "dangerous-docker") {
    const baseDir =
      env.LANGFUSE_IN_APP_AGENT_SANDBOX_LOCAL_SNAPSHOT_DIR ??
      path.join(os.tmpdir(), "langfuse-sandboxes");
    await rm(path.join(baseDir, params.snapshotKey), { force: true }).catch(
      () => undefined,
    );
    return;
  }

  if (!env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET) {
    return;
  }

  const client = new S3Client({
    ...(env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION
      ? { region: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_REGION }
      : {}),
    ...(env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ENDPOINT
      ? { endpoint: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ENDPOINT }
      : {}),
    ...(env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_FORCE_PATH_STYLE === "true"
      ? { forcePathStyle: true }
      : {}),
    ...(env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID &&
    env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId:
              env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_ACCESS_KEY_ID,
            secretAccessKey:
              env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });
  const prefix = env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_PREFIX.replace(
    /\/+$/u,
    "",
  );
  const objectKey = prefix ? `${prefix}/${params.snapshotKey}` : params.snapshotKey;

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
      Key: objectKey,
    }),
  );
}
