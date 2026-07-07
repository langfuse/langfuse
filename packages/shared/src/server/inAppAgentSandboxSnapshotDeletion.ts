import {
  LambdaMicrovmsClient,
  SuspendMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function deleteLambdaMicrovmInAppAgentSandboxSnapshot(params: {
  endpoint?: string;
  snapshotBucket?: string;
  snapshotPrefix: string;
  snapshotRegion?: string;
  snapshotAccessKeyId?: string;
  snapshotSecretAccessKey?: string;
  snapshotForcePathStyle?: boolean;
  sessionId?: string | null;
  snapshotKey: string;
}) {
  if (params.sessionId) {
    const client = new LambdaMicrovmsClient({
      ...(params.endpoint ? { endpoint: params.endpoint } : {}),
    });

    await client
      .send(new SuspendMicrovmCommand({ microvmIdentifier: params.sessionId }))
      .catch(() => undefined);
  }

  if (!params.snapshotBucket) {
    return;
  }

  const client = new S3Client({
    ...(params.snapshotRegion ? { region: params.snapshotRegion } : {}),
    ...(params.endpoint ? { endpoint: params.endpoint } : {}),
    ...(params.snapshotForcePathStyle ? { forcePathStyle: true } : {}),
    ...(params.snapshotAccessKeyId && params.snapshotSecretAccessKey
      ? {
          credentials: {
            accessKeyId: params.snapshotAccessKeyId,
            secretAccessKey: params.snapshotSecretAccessKey,
          },
        }
      : {}),
  });
  const prefix = params.snapshotPrefix.replace(/\/+$/u, "");
  const objectKey = prefix
    ? `${prefix}/${params.snapshotKey}`
    : params.snapshotKey;

  await client.send(
    new DeleteObjectCommand({
      Bucket: params.snapshotBucket,
      Key: objectKey,
    }),
  );
}
