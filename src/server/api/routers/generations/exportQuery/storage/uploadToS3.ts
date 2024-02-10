import type { Readable } from "stream";

import { env } from "@/src/env.mjs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getIsS3BucketConfigured } from "../config/getIsS3BucketConfigured";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
};

export async function uploadToS3({ fileName, fileType, data }: UploadFile) {
  if (!getIsS3BucketConfigured(env)) {
    throw Error("S3 bucket is not configured");
  }

  try {
    const client = new S3Client({
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
    });

    await new Upload({
      client,
      params: {
        Bucket: env.S3_BUCKET_NAME,
        Key: fileName,
        Body: data,
        ContentType: fileType,
      },
    }).done();

    const SECONDS_PER_HOUR = 60 * 60;
    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: fileName,
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
      {
        expiresIn: SECONDS_PER_HOUR, // signed url will expire in 1 hour
      },
    );

    return { signedUrl };
  } catch (err) {
    console.error(err);

    throw Error("Failed to upload to S3 or generate signed URL");
  }
}
