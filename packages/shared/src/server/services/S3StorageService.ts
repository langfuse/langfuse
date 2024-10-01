import type { Readable } from "stream";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "../logger";

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
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
  }) {
    // Use accessKeyId and secretAccessKey if provided or fallback to default credentials
    const { accessKeyId, secretAccessKey } = params;
    const credentials =
      accessKeyId !== undefined && secretAccessKey !== undefined
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined;

    this.client = new S3Client({
      credentials,
      endpoint: params.endpoint,
      region: params.region,
      forcePathStyle: params.forcePathStyle,
    });
    this.bucketName = params.bucketName;
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
      logger.error(`Failed to upload file to ${fileName}`, err);
      throw new Error("Failed to upload to S3 or generate signed URL");
    }
  }

  public async uploadJson(path: string, body: Record<string, unknown>[]) {
    const putCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: path,
      Body: JSON.stringify(body),
      ContentType: "application/json",
    });

    try {
      await this.client.send(putCommand);
    } catch (err) {
      logger.error(`Failed to upload JSON to S3 ${path}`, err);
      throw Error("Failed to upload JSON to S3");
    }
  }

  public async download(path: string): Promise<string> {
    const getCommand = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: path,
    });

    try {
      const response = await this.client.send(getCommand);
      return (await response.Body?.transformToString()) ?? "";
    } catch (err) {
      logger.error(`Failed to download file from S3 ${path}`, err);
      throw Error("Failed to download file from S3");
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
          Bucket: this.bucketName,
          Key: fileName,
          ResponseContentDisposition: `attachment; filename="${fileName}"`,
        }),
        { expiresIn: ttlSeconds },
      );
    } catch (err) {
      logger.error(`Failed to generate presigned URL for ${fileName}`, err);
      throw Error("Failed to generate signed URL");
    }
  }
}
