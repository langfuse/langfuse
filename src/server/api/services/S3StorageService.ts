import type { Readable } from "stream";
import { env } from "@/src/env.mjs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
};

class S3StorageService {
  private client: S3Client;

  constructor() {
    if (!S3StorageService.getIsS3StorageConfigured(env)) {
      throw new Error("S3 bucket is not configured");
    }

    this.client = new S3Client({
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
    });
  }

  public async uploadFile({
    fileName,
    fileType,
    data,
  }: UploadFile): Promise<{ signedUrl: string }> {
    try {
      await new Upload({
        client: this.client,
        params: {
          Bucket: env.S3_BUCKET_NAME,
          Key: fileName,
          Body: data,
          ContentType: fileType,
        },
      }).done();

      const expiresInOneHour = 60 * 60;
      const signedUrl = await this.getSignedUrl(fileName, expiresInOneHour);

      return { signedUrl };
    } catch (err) {
      console.error(err);

      throw new Error("Failed to upload to S3 or generate signed URL");
    }
  }

  private async getSignedUrl(
    fileName: string,
    ttlSeconds: number,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: env.S3_BUCKET_NAME,
          Key: fileName,
          ResponseContentDisposition: `attachment; filename="${fileName}"`,
        }),
        { expiresIn: ttlSeconds },
      );
    } catch (err) {
      throw Error("Failed to generate signed URL");
    }
  }

  static getIsS3StorageConfigured(
    currentEnv: Env,
  ): currentEnv is S3ConfiguredEnv {
    return Boolean(
      currentEnv.S3_BUCKET_NAME &&
        currentEnv.S3_ACCESS_KEY_ID &&
        currentEnv.S3_SECRET_ACCESS_KEY &&
        currentEnv.S3_ENDPOINT &&
        currentEnv.S3_REGION,
    );
  }
}

export { S3StorageService };

type Env = typeof env;
type S3ConfiguredEnv = Env & {
  S3_ACCESS_KEY_ID: string;
  S3_SECRET_ACCESS_KEY: string;
  S3_ENDPOINT: string;
  S3_REGION: string;
};
