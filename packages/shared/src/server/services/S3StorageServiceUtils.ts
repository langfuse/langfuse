import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

interface ListFilesResult {
  files: string[];
  truncated: boolean;
}

/**
 * Lists S3 files with pagination support using ContinuationToken.
 * Returns all files under the given prefix up to maxFiles limit.
 */
export async function listS3FilesPaginated(
  client: S3Client,
  bucket: string,
  prefix: string,
  maxFiles: number = 1_000_000,
): Promise<ListFilesResult> {
  const files: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000, // S3 max per request
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        files.push(obj.Key);
        if (files.length > maxFiles) {
          return { files, truncated: true };
        }
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return { files, truncated: false };
}
