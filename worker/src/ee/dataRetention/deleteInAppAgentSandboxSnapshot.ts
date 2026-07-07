import {
  LambdaMicrovmsClient,
  SuspendMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../env";

export async function deleteInAppAgentSandboxSnapshot(params: {
  sandboxProvider: string | null;
  snapshotKey: string;
  sessionId?: string | null;
}) {
  if (params.sandboxProvider !== "lambda-microvm") {
    return;
  }

  if (params.sessionId) {
    const client = new LambdaMicrovmsClient({
      ...(env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_ENDPOINT
        ? {
            endpoint:
              env.LANGFUSE_IN_APP_AGENT_SANDBOX_AWS_LAMBDA_MICROVM_ENDPOINT,
          }
        : {}),
    });

    await client
      .send(new SuspendMicrovmCommand({ microvmIdentifier: params.sessionId }))
      .catch(() => undefined);
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
  const objectKey = prefix
    ? `${prefix}/${params.snapshotKey}`
    : params.snapshotKey;

  await client.send(
    new DeleteObjectCommand({
      Bucket: env.LANGFUSE_IN_APP_AGENT_SANDBOX_SNAPSHOT_BUCKET,
      Key: objectKey,
    }),
  );
}
