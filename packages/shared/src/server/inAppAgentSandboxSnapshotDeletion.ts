import {
  LambdaMicrovmsClient,
  SuspendMicrovmCommand,
} from "@aws-sdk/client-lambda-microvms";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export async function deleteLambdaMicrovmInAppAgentSandboxSnapshot(params: {
  snapshotBucket?: string;
  snapshotPrefix: string;
  snapshotRegion?: string;
  sessionId?: string | null;
  snapshotKey: string;
}) {
  if (params.sessionId) {
    const client = new LambdaMicrovmsClient({});

    await client
      .send(new SuspendMicrovmCommand({ microvmIdentifier: params.sessionId }))
      .catch(() => undefined);
  }

  if (!params.snapshotBucket) {
    return;
  }

  const client = new S3Client({
    ...(params.snapshotRegion ? { region: params.snapshotRegion } : {}),
  });
  let prefix = params.snapshotPrefix;
  while (prefix.endsWith("/")) {
    prefix = prefix.slice(0, -1);
  }
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
