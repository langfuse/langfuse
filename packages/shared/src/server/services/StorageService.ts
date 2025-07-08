import { Readable } from "stream";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectCommandInput,
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
import { Storage, Bucket, GetSignedUrlConfig } from "@google-cloud/storage";
import { logger } from "../logger";
import { env } from "../../env";
import { backOff } from "exponential-backoff";

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
  expiresInSeconds: number;
};

export interface StorageService {
  uploadFile(params: UploadFile): Promise<{ signedUrl: string }>; // eslint-disable-line no-unused-vars

  uploadJson(path: string, body: Record<string, unknown>[]): Promise<void>; // eslint-disable-line no-unused-vars

  download(path: string): Promise<string>; // eslint-disable-line no-unused-vars

  listFiles(prefix: string): Promise<{ file: string; createdAt: Date }[]>; // eslint-disable-line no-unused-vars

  getSignedUrl(
    fileName: string, // eslint-disable-line no-unused-vars
    ttlSeconds: number, // eslint-disable-line no-unused-vars
    asAttachment?: boolean, // eslint-disable-line no-unused-vars
  ): Promise<string>;

  // eslint-disable-next-line no-unused-vars
  getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string>;

  deleteFiles(paths: string[]): Promise<void>; // eslint-disable-line no-unused-vars
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
   * @param params.useAzureBlob - Use Azure Blob Storage instead of S3
   * @param params.useGoogleCloudStorage - Use Google Cloud Storage instead of S3
   * @param params.googleCloudCredentials - Google Cloud Storage credentials JSON string or path to credentials file
   * @param params.awsSse - Server-side encryption method (e.g., "aws:kms")
   * @param params.awsSseKmsKeyId - SSE KMS Key ID when using KMS encryption
   */
  public static getInstance(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
    useAzureBlob?: boolean;
    useGoogleCloudStorage?: boolean;
    googleCloudCredentials?: string;
    awsSse: string | undefined;
    awsSseKmsKeyId: string | undefined;
  }): StorageService {
    if (params.useAzureBlob || env.LANGFUSE_USE_AZURE_BLOB === "true") {
      return new AzureBlobStorageService(params);
    }
    if (
      params.useGoogleCloudStorage ||
      env.LANGFUSE_USE_GOOGLE_CLOUD_STORAGE === "true"
    ) {
      // Use provided credentials or fall back to environment variable
      const googleParams = {
        ...params,
        googleCloudCredentials:
          params.googleCloudCredentials ||
          env.LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS,
      };
      return new GoogleCloudStorageService(googleParams);
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
        const blockIds = [];
        for await (const chunk of data) {
          // Azure requires block IDs to be base64 strings of the same length
          // Use a fixed format with padded index to ensure consistent length
          const blockIdStr: string = `block-${blockIds.length.toString().padStart(10, "0")}`;
          const blockId = Buffer.from(blockIdStr).toString("base64");

          const bufferChunk = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

          await blockBlobClient.stageBlock(
            blockId,
            bufferChunk,
            bufferChunk.length,
          );
          blockIds.push(blockId);
        }
        if (blockIds.length > 0) {
          await blockBlobClient.commitBlockList(blockIds);
        }
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
    await backOff(() => this.deleteFileNonRetrying(paths), {
      numOfAttempts: 3,
    });
  }

  async deleteFileNonRetrying(paths: string[]): Promise<void> {
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
  private signedUrlClient: S3Client;
  private bucketName: string;
  private awsSse: string | undefined;
  private awsSseKmsKeyId: string | undefined;

  constructor(params: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
    region: string | undefined;
    forcePathStyle: boolean;
    awsSse: string | undefined;
    awsSseKmsKeyId: string | undefined;
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

    // Create the main client for S3 operations using the internal endpoint
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

    // Create a separate client for generating presigned URLs
    // If an external endpoint is provided, use it for the URL client
    // Otherwise, use the same client for both operations
    this.signedUrlClient = params.externalEndpoint
      ? new S3Client({
          credentials,
          endpoint: params.externalEndpoint,
          region: params.region,
          forcePathStyle: params.forcePathStyle,
          requestHandler: {
            httpsAgent: {
              maxSockets: env.LANGFUSE_S3_CONCURRENT_WRITES,
            },
          },
        })
      : this.client;

    this.bucketName = params.bucketName;
    this.awsSse = params.awsSse;
    this.awsSseKmsKeyId = params.awsSseKmsKeyId;
  }

  private addSSEToParams<T>(params: Record<string, unknown>): T {
    if (this.awsSse) {
      params.ServerSideEncryption = this.awsSse;
      if (this.awsSse === "aws:kms" && this.awsSseKmsKeyId) {
        params.SSEKMSKeyId = this.awsSseKmsKeyId;
      }
    }
    return params as T;
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
        params: this.addSSEToParams<PutObjectCommandInput>({
          Bucket: this.bucketName,
          Key: fileName,
          Body: data,
          ContentType: fileType,
        }),
      }).done();

      const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);

      return { signedUrl };
    } catch (err) {
      logger.error(`Failed to upload file to ${fileName}`, err);
      throw new Error(`Failed to upload to S3 or generate signed URL: ${err}`);
    }
  }

  public async uploadJson(path: string, body: Record<string, unknown>[]) {
    const putCommand = new PutObjectCommand(
      this.addSSEToParams({
        Bucket: this.bucketName,
        Key: path,
        Body: JSON.stringify(body),
        ContentType: "application/json",
      }),
    );

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
      MaxKeys: env.LANGFUSE_S3_LIST_MAX_KEYS,
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
      return getSignedUrl(
        this.signedUrlClient,
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

  public async deleteFiles(paths: string[]): Promise<void> {
    await backOff(() => this.deleteFilesNonRetrying(paths), {
      numOfAttempts: 3,
    });
  }

  async deleteFilesNonRetrying(paths: string[]): Promise<void> {
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
          const errors = result.Errors.map((e) => e.Key).join(", ");
          logger.error(`Failed to delete files from S3: ${errors} `, {
            errors: result.Errors,
            files: chunk,
          });
          throw new Error(`Failed to delete files from S3: ${errors}`);
        }
      }
    } catch (err) {
      logger.error(`Failed to delete files from S3`, {
        error: err,
        files: paths,
      });
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

    return getSignedUrl(
      this.signedUrlClient,
      new PutObjectCommand(
        this.addSSEToParams({
          Bucket: this.bucketName,
          Key: path,
          ContentType: contentType,
          ChecksumSHA256: sha256Hash,
          ContentLength: contentLength,
        }),
      ),
      {
        expiresIn: ttlSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      },
    );
  }
}

class GoogleCloudStorageService implements StorageService {
  private storage: Storage;
  private bucket: Bucket;

  constructor(params: { bucketName: string; googleCloudCredentials?: string }) {
    // Initialize Google Cloud Storage client
    if (params.googleCloudCredentials) {
      try {
        // Check if the credentials are a JSON string or a path to a file
        if (params.googleCloudCredentials.trim().startsWith("{")) {
          // It's a JSON string
          this.storage = new Storage({
            credentials: JSON.parse(params.googleCloudCredentials),
          });
        } else {
          // It's a path to a credentials file
          this.storage = new Storage({
            keyFilename: params.googleCloudCredentials,
          });
        }
      } catch (err) {
        logger.error("Failed to parse Google Cloud Storage credentials", err);
        throw new Error("Failed to initialize Google Cloud Storage");
      }
    } else {
      // Use default authentication (environment variables or instance metadata)
      this.storage = new Storage();
    }

    this.bucket = this.storage.bucket(params.bucketName);
  }

  public async uploadFile({
    fileName,
    fileType,
    data,
    expiresInSeconds,
  }: UploadFile): Promise<{ signedUrl: string }> {
    try {
      const file = this.bucket.file(fileName);
      const options = {
        contentType: fileType,
        resumable: false,
      };

      if (typeof data === "string") {
        await file.save(data, options);
        const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);
        return { signedUrl };
      } else if (data instanceof Readable) {
        return new Promise((resolve, reject) => {
          const writeStream = file.createWriteStream(options);

          data
            .pipe(writeStream)
            .on("error", (err) => {
              reject(err);
            })
            .on("finish", async () => {
              try {
                const signedUrl = await this.getSignedUrl(
                  fileName,
                  expiresInSeconds,
                );
                resolve({ signedUrl });
              } catch (err) {
                reject(err);
              }
            });
        });
      } else {
        throw new Error("Unsupported data type. Must be Readable or string.");
      }
    } catch (err) {
      logger.error(
        `Failed to upload file to Google Cloud Storage ${fileName}`,
        err,
      );
      throw new Error("Failed to upload to Google Cloud Storage");
    }
  }

  public async uploadJson(
    path: string,
    body: Record<string, unknown>[],
  ): Promise<void> {
    try {
      const file = this.bucket.file(path);
      const content = JSON.stringify(body);

      await file.save(content, {
        contentType: "application/json",
        resumable: false,
      });
    } catch (err) {
      logger.error(
        `Failed to upload JSON to Google Cloud Storage ${path}`,
        err,
      );
      throw Error("Failed to upload JSON to Google Cloud Storage");
    }
  }

  public async download(path: string): Promise<string> {
    try {
      const file = this.bucket.file(path);
      const [content] = await file.download();

      return content.toString();
    } catch (err) {
      logger.error(
        `Failed to download file from Google Cloud Storage ${path}`,
        err,
      );
      throw Error("Failed to download file from Google Cloud Storage");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    try {
      const [files] = await this.bucket.getFiles({ prefix });

      return files.map((file) => ({
        file: file.name,
        createdAt: new Date(file.metadata.timeCreated ?? new Date()),
      }));
    } catch (err) {
      logger.error(
        `Failed to list files from Google Cloud Storage ${prefix}`,
        err,
      );
      throw Error("Failed to list files from Google Cloud Storage");
    }
  }

  public async getSignedUrl(
    fileName: string,
    ttlSeconds: number,
    asAttachment: boolean = false,
  ): Promise<string> {
    try {
      const file = this.bucket.file(fileName);

      const options: GetSignedUrlConfig = {
        version: "v4",
        action: "read",
        expires: Date.now() + ttlSeconds * 1000,
      };

      if (asAttachment) {
        options.responseDisposition = `attachment; filename="${fileName}"`;
      }

      const [url] = await file.getSignedUrl(options);
      return url;
    } catch (err) {
      logger.error(
        `Failed to generate signed URL for Google Cloud Storage ${fileName}`,
        err,
      );
      throw Error("Failed to generate signed URL for Google Cloud Storage");
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
      const file = this.bucket.file(path);

      const options: GetSignedUrlConfig = {
        version: "v4",
        action: "write",
        expires: Date.now() + ttlSeconds * 1000,
        contentType,
        extensionHeaders: {
          "Content-Length": params.contentLength.toString(),
        },
      };

      const [url] = await file.getSignedUrl(options);
      return url;
    } catch (err) {
      logger.error(
        `Failed to generate signed upload URL for Google Cloud Storage ${path}`,
        err,
      );
      throw Error(
        "Failed to generate signed upload URL for Google Cloud Storage",
      );
    }
  }

  public async deleteFiles(paths: string[]): Promise<void> {
    try {
      await Promise.all(
        paths.map(async (path) => {
          const file = this.bucket.file(path);
          await file.delete({ ignoreNotFound: true });
        }),
      );
    } catch (err) {
      logger.error(`Failed to delete files from Google Cloud Storage`, err);
      throw Error("Failed to delete files from Google Cloud Storage");
    }
  }
}
