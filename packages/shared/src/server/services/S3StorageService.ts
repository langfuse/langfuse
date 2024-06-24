import type { Readable } from "stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
  expiresInSeconds: number;
};

export class S3StorageService {
  private client: S3Client;
  private bucketName: string;

  constructor(params: {
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    endpoint: string;
    region: string;
  }) {
    const { accessKeyId, secretAccessKey, bucketName, endpoint, region } =
      params;

    this.client = new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint,
      region,
    });
    this.bucketName = bucketName;
  }

  public async uploadFile({
    fileName,
    fileType,
    data,
    expiresInSeconds,
  }: UploadFile): Promise<{ signedUrl: string }> {
    try {
      await new Upload({
        client: this.client,
        params: {
          Bucket: this.bucketName,
          Key: fileName,
          Body: data,
          ContentType: fileType,
        },
      }).done();

      const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);

      return { signedUrl };
    } catch (err) {
      console.error(err);

      throw new Error("Failed to upload to S3 or generate signed URL");
    }
  }

  private async getSignedUrl(
    fileName: string,
    ttlSeconds: number
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileName,
          ResponseContentDisposition: `attachment; filename="${fileName}"`,
        }),
        { expiresIn: ttlSeconds }
      );
    } catch (err) {
      throw Error("Failed to generate signed URL");
    }
  }
}
