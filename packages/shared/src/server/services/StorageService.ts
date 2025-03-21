import { Readable } from "stream";
import {
  DeleteObjectsCommand,
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

  listFiles(prefix: string): Promise<{ file: string; createdAt: Date }[]>;

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

  deleteFiles(paths: string[]): Promise<void>;
}

export class StorageServiceFactory {
  /**
   * Get an instance of the StorageService
   * @param params.accessKeyId - Access key ID
   * @param params.secretAccessKey - Secret access key
   * @param params.bucketName - Bucket name to store files
   * @param params.endpoint - Endpoint - Endpoint to an S3 compatible API (or Azure Blob Storage)
   * @param params.externalEndpoint - External endpoint to replace the internal endpoint in the signed URL.
   * @param params.region - Region in which the bucket resides
   * @param params.forcePathStyle - Add bucket name into the path instead of the domain name. Mainly used for MinIO.
   */
  public static getInstance(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
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
  private externalEndpoint: string | undefined;

  constructor(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
  }) {
    const { accessKeyId, secretAccessKey, endpoint, externalEndpoint } = params;
    if (!accessKeyId || !secretAccessKey || !endpoint) {
      throw new Error(
        `Endpoint, account and account key must be configured to use Azure Blob Storage`,
      );
    }

    this.externalEndpoint = externalEndpoint;
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

  public async deleteFiles(paths: string[]): Promise<void> {
    try {
      await this.createContainerIfNotExists();

      await Promise.all(
        paths.map(async (path) => {
          const blobClient = this.client.getBlobClient(path);
          await blobClient.deleteIfExists();
        }),
      );
    } catch (err) {
      logger.error(
        `Failed to delete files from Azure Blob Storage ${paths}`,
        err,
      );
      throw Error("Failed to delete files from Azure Blob Storage");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    try {
      await this.createContainerIfNotExists();

      const result = await this.client.listBlobsFlat({ prefix });
      const files = [];
      for await (const blob of result) {
        if (blob.name.startsWith(prefix)) {
          files.push({
            file: blob.name,
            createdAt: blob?.properties?.createdOn ?? new Date(),
          });
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
      let url = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: new Date(Date.now() + ttlSeconds * 1000),
        contentDisposition: asAttachment
          ? `attachment; filename="${fileName}"`
          : undefined,
      });

      // Replace internal endpoint with external endpoint if configured
      if (this.externalEndpoint && url.includes(this.client.url)) {
        url = url.replace(this.client.url, this.externalEndpoint);
      }

      return url;
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
      let url = await blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("w"),
        expiresOn: new Date(Date.now() + ttlSeconds * 1000),
        contentType: contentType,
      });

      // Replace internal endpoint with external endpoint if configured
      if (this.externalEndpoint && url.includes(this.client.url)) {
        url = url.replace(this.client.url, this.externalEndpoint);
      }

      return url;
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
  private endpoint: string | undefined;
  private externalEndpoint: string | undefined;

  constructor(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
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
      requestHandler: {
        httpsAgent: {
          maxSockets: env.LANGFUSE_S3_CONCURRENT_WRITES,
        },
      },
    });
    this.bucketName = params.bucketName;
    this.endpoint = params.endpoint;
    this.externalEndpoint = params.externalEndpoint;
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

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    try {
      const response = await this.client.send(listCommand);
      return (
        response.Contents?.flatMap((file) =>
          file.Key
            ? [{ file: file.Key, createdAt: file.LastModified ?? new Date() }]
            : [],
        ) ?? []
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
      let url = await getSignedUrl(
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

      // Replace internal endpoint with external endpoint if configured
      if (
        this.externalEndpoint &&
        this.endpoint &&
        url.includes(this.endpoint)
      ) {
        url = url.replace(this.endpoint, this.externalEndpoint);
      }

      return url;
    } catch (err) {
      logger.error(`Failed to generate presigned URL for ${fileName}`, err);
      throw Error("Failed to generate signed URL");
    }
  }

  public async deleteFiles(paths: string[]): Promise<void> {
    const chunkSize = 900;
    const chunks = [];

    for (let i = 0; i < paths.length; i += chunkSize) {
      chunks.push(paths.slice(i, i + chunkSize));
    }

    try {
      for (const chunk of chunks) {
        const command = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: chunk.map((path) => ({ Key: path })),
            Quiet: true,
          },
        });
        const result = await this.client.send(command);
        if (result?.Errors && result?.Errors?.length > 0) {
          logger.error("Failed to delete files from S3", {
            errors: result.Errors,
          });
          throw new Error("Failed to delete files from S3");
        }
      }
    } catch (err) {
      logger.error(`Failed to delete files from S3`, err);
      throw new Error("Failed to delete files from S3");
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

    let url = await getSignedUrl(
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

    // Replace internal endpoint with external endpoint if configured
    if (this.externalEndpoint && this.endpoint && url.includes(this.endpoint)) {
      url = url.replace(this.endpoint, this.externalEndpoint);
    }

    return url;
  }
}
