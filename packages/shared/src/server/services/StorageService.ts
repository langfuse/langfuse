import { Readable } from "stream";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { logger } from "../logger";
import { env } from "../../env";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
  expiresInSeconds: number;
};

export interface StorageService {
  uploadFile(params: UploadFile): Promise<{ signedUrl: string }>;

  uploadJson(path: string, body: Record<string, unknown>[]): Promise<void>;

  download(path: string): Promise<string>;

  listFiles(prefix: string): Promise<string[]>;

  getSignedUrl(
    fileName: string,
    ttlSeconds: number,
    asAttachment?: boolean,
  ): Promise<string>;

  getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string>;
}

export class StorageServiceFactory {
  public static getInstance(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
  }): StorageService {
    if (env.LANGFUSE_USE_AZURE_BLOB === "true") {
      return new AzureBlobStorageService(params);
    }
    return new S3StorageService(params);
  }
}

class AzureBlobStorageService implements StorageService {
  private client: ContainerClient;
  private container: string;

  constructor(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
  }) {
    const { accessKeyId, secretAccessKey, endpoint } = params;
    if (!accessKeyId || !secretAccessKey || !endpoint) {
      throw new Error(
        `Endpoint, account and account key must be configured to use Azure Blob Storage`,
      );
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
      accessKeyId,
      secretAccessKey,
    );
    const blobServiceClient = new BlobServiceClient(
      endpoint,
      sharedKeyCredential,
    );
    this.container = params.bucketName;
    this.client = blobServiceClient.getContainerClient(this.container);
  }

  private async createContainerIfNotExists(): Promise<void> {
    try {
      await this.client.createIfNotExists();
    } catch (err) {
      logger.error(
        `Failed to create Azure Blob Storage container ${this.container}`,
        err,
      );
      throw Error("Failed to create Azure Blob Storage container ");
    }
  }

  public async uploadFile(params: UploadFile): Promise<{ signedUrl: string }> {
    const { fileName, data, expiresInSeconds } = params;
    try {
      await this.createContainerIfNotExists();

      const blockBlobClient = this.client.getBlockBlobClient(fileName);

      if (typeof data === "string") {
        await blockBlobClient.upload(data, data.length);
      } else if (data instanceof Readable) {
        let offset = 0;
        const blockIds = [];
        for await (const chunk of data) {
          const blockId = Buffer.from(`block-${offset}`).toString("base64");
          const bufferChunk = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

          await blockBlobClient.stageBlock(
            blockId,
            bufferChunk,
            bufferChunk.length,
          );
          blockIds.push(blockId);

          offset += bufferChunk.length;
        }

        await blockBlobClient.commitBlockList(blockIds);
      } else {
        throw new Error("Unsupported data type. Must be Readable or string.");
      }

      return {
        signedUrl: await this.getSignedUrl(fileName, expiresInSeconds, false),
      };
    } catch (err) {
      logger.error(
        `Failed to upload file to Azure Blob Storage ${fileName}`,
        err,
      );
      throw Error("Failed to upload file to Azure Blob Storage");
    }
  }

  public async uploadJson(
    path: string,
    body: Record<string, unknown>[],
  ): Promise<void> {
    await this.createContainerIfNotExists();

    const blockBlobClient = this.client.getBlockBlobClient(path);
    const content = JSON.stringify(body);
    try {
      await blockBlobClient.upload(content, content.length);
    } catch (err) {
      logger.error(`Failed to upload JSON to Azure Blob Storage ${path}`, err);
      throw Error("Failed to upload JSON to Azure Blob Storage");
    }
  }

  private async streamToString(
    readableStream: NodeJS.ReadableStream,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      readableStream.on("data", (data) => {
        chunks.push(data.toString());
      });
      readableStream.on("end", () => {
        resolve(chunks.join(""));
      });
      readableStream.on("error", reject);
    });
  }

  public async download(path: string): Promise<string> {
    try {
      await this.createContainerIfNotExists();

      const blobClient = this.client.getBlobClient(path);
      const downloadResponse = await blobClient.download();
      if (!downloadResponse.readableStreamBody) {
        throw Error("No stream body available");
      }
      return this.streamToString(downloadResponse.readableStreamBody);
    } catch (err) {
      logger.error(
        `Failed to download file from Azure Blob Storage ${path}`,
        err,
      );
      throw Error("Failed to download file from Azure Blob Storage");
    }
  }

  public async listFiles(prefix: string): Promise<string[]> {
    try {
      await this.createContainerIfNotExists();

      const result = await this.client.listBlobsFlat({ prefix });
      const files = [];
      for await (const blob of result) {
        if (blob.name.startsWith(prefix)) {
          files.push(blob.name);
        }
      }
      return files;
    } catch (err) {
      logger.error(
        `Failed to list files from Azure Blob Storage ${prefix}`,
        err,
      );
      throw Error("Failed to list files from Azure Blob Storage");
    }
  }

  public async getSignedUrl(
    fileName: string,
    ttlSeconds: number,
    asAttachment?: boolean,
  ): Promise<string> {
    try {
      await this.createContainerIfNotExists();

      const blockBlobClient = this.client.getBlockBlobClient(fileName);
      return blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + ttlSeconds * 1000),
        contentDisposition: asAttachment
          ? `attachment; filename="${fileName}"`
          : undefined,
      });
    } catch (err) {
      logger.error(
        `Failed to generate presigned URL for Azure Blob Storage ${fileName}`,
        err,
      );
      throw Error("Failed to generate presigned URL for Azure Blob Storage");
    }
  }

  public async getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string> {
    const { path, ttlSeconds, contentType } = params;
    try {
      await this.createContainerIfNotExists();

      const blockBlobClient = this.client.getBlockBlobClient(path);
      return blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("w"),
        expiresOn: new Date(Date.now() + ttlSeconds * 1000),
        contentType: contentType,
      });
    } catch (err) {
      logger.error(
        `Failed to generate presigned upload URL for Azure Blob Storage ${path}`,
        err,
      );
      throw Error(
        "Failed to generate presigned upload URL for Azure Blob Storage",
      );
    }
  }
}

class S3StorageService implements StorageService {
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

  public async listFiles(prefix: string): Promise<string[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    try {
      const response = await this.client.send(listCommand);
      return (
        response.Contents?.flatMap((file) => (file.Key ? [file.Key] : [])) ?? []
      );
    } catch (err) {
      logger.error(`Failed to list files from S3 ${prefix}`, err);
      throw Error("Failed to list files from S3");
    }
  }

  public async getSignedUrl(
    fileName: string,
    ttlSeconds: number,
    asAttachment: boolean = true,
  ): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: fileName,
          ResponseContentDisposition: asAttachment
            ? `attachment; filename="${fileName}"`
            : undefined,
        }),
        { expiresIn: ttlSeconds },
      );
    } catch (err) {
      logger.error(`Failed to generate presigned URL for ${fileName}`, err);
      throw Error("Failed to generate signed URL");
    }
  }

  public async getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string> {
    const { path, ttlSeconds, contentType, contentLength, sha256Hash } = params;

    return await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: path,
        ContentType: contentType,
        ChecksumSHA256: sha256Hash,
        ContentLength: contentLength,
      }),
      {
        expiresIn: ttlSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      },
    );
  }
}
