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
import { ServiceUnavailableError } from "../../errors";
import { BufferedStreamUploader } from "./BufferedStreamUploader";
import { S3ChunkedUploadStrategy } from "./S3ChunkedUploadStrategy";
import * as objectstorage from "oci-objectstorage";
import * as common from "oci-common";
import { UploadManager as OciUploadManager } from "oci-objectstorage";
import { URL } from "node:url";

export interface S3SseConfig {
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
}

export function buildS3SseParams(
  sseConfig?: S3SseConfig,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (sseConfig?.serverSideEncryption) {
    params.ServerSideEncryption = sseConfig.serverSideEncryption;
    if (sseConfig.serverSideEncryption === "aws:kms" && sseConfig.sseKmsKeyId) {
      params.SSEKMSKeyId = sseConfig.sseKmsKeyId;
    }
  }
  return params;
}

type UploadFile = {
  fileName: string;
  fileType: string;
  data: Readable | string;
  partSize?: number; // Optional: Part size in bytes for multipart uploads (S3 only)
  queueSize?: number; // Optional: Number of concurrent part uploads (S3 only)
};

type UploadFileBuffered = {
  fileName: string;
  fileType: string;
  data: Readable;
  partSizeBytes: number;
};

type UploadWithSignedUrl = UploadFile & {
  expiresInSeconds: number;
};

/**
 * Check if an error is a DNS lookup failure (EAI_AGAIN)
 * and throw ServiceUnavailableError if so, otherwise rethrow the original error
 */
function handleStorageError(err: unknown, operation: string): never {
  // Check if error has a code property matching EAI_AGAIN
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    err.code === "EAI_AGAIN"
  ) {
    logger.error(`DNS lookup failure during ${operation}`, err);
    throw new ServiceUnavailableError(
      "Storage service temporarily unavailable due to network issues",
    );
  }
  // For other errors, throw with the original cause preserved
  throw new Error(`Failed to ${operation}`, { cause: err });
}

export interface StorageService {
  uploadFile(params: UploadFile): Promise<void>;

  uploadFileBuffered(params: UploadFileBuffered): Promise<void>;

  uploadWithSignedUrl(
    params: UploadWithSignedUrl,
  ): Promise<{ signedUrl: string }>;

  uploadJson(
    path: string,
    body: Record<string, unknown>[] | Record<string, unknown>,
  ): Promise<void>;

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
   * @param params.useAzureBlob - Use Azure Blob Storage instead of S3
   * @param params.useOCIObjectStorage - Use OCI Object Storage instead of S3
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
    useOCIObjectStorage?: boolean;
    googleCloudCredentials?: string;
    awsSse: string | undefined;
    awsSseKmsKeyId: string | undefined;
  }): StorageService {
    if (
      params.useAzureBlob !== undefined
        ? params.useAzureBlob
        : env.LANGFUSE_USE_AZURE_BLOB === "true"
    ) {
      return new AzureBlobStorageService(params);
    }
    if (
      params.useGoogleCloudStorage !== undefined
        ? params.useGoogleCloudStorage
        : env.LANGFUSE_USE_GOOGLE_CLOUD_STORAGE === "true"
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
    if (
      params.useOCIObjectStorage !== undefined
        ? params.useOCIObjectStorage
        : env.LANGFUSE_USE_OCI_NATIVE_OBJECT_STORAGE === "true"
    ) {
      return new OCIObjectStorageService(params);
    }
    return new S3StorageService(params);
  }
}

let azureContainersExists: Record<string, boolean> = {};
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
    // Skip container existence check if environment variable is set
    if (env.LANGFUSE_AZURE_SKIP_CONTAINER_CHECK === "true") {
      return;
    }

    try {
      if (azureContainersExists[this.container]) {
        return; // Container already exists, no need to create it again
      }
      await this.client.createIfNotExists();
      azureContainersExists[this.container] = true; // Mark container as created
      logger.info(`Azure Blob Storage container ${this.container} created`);
    } catch (err) {
      logger.error(
        `Failed to create Azure Blob Storage container ${this.container}`,
        err,
      );
      handleStorageError(err, "create Azure Blob Storage container");
    }
  }

  public async uploadFile(params: UploadFile): Promise<void> {
    const { fileName, fileType, data, partSize } = params;
    try {
      await this.createContainerIfNotExists();

      const blockBlobClient = this.client.getBlockBlobClient(fileName);

      if (typeof data === "string") {
        await blockBlobClient.upload(data, data.length, {
          blobHTTPHeaders: { blobContentType: fileType },
        });
      } else if (data instanceof Readable) {
        // bufferSize controls the block size (default 8MB supports ~800GB files)
        const bufferSize = partSize ?? 8 * 1024 * 1024; // Default 8MB per block
        const maxConcurrency = 5; // Default value

        await blockBlobClient.uploadStream(data, bufferSize, maxConcurrency, {
          blobHTTPHeaders: { blobContentType: fileType },
        });
      } else {
        throw new Error("Unsupported data type. Must be Readable or string.");
      }

      return;
    } catch (err) {
      logger.error(
        `Failed to upload file to Azure Blob Storage ${fileName}`,
        err,
      );
      handleStorageError(err, "upload file to Azure Blob Storage");
    }
  }

  public async uploadFileBuffered(params: UploadFileBuffered): Promise<void> {
    await this.uploadFile({
      fileName: params.fileName,
      fileType: params.fileType,
      data: params.data,
      partSize: params.partSizeBytes,
    });
  }

  public async uploadWithSignedUrl(
    params: UploadWithSignedUrl,
  ): Promise<{ signedUrl: string }> {
    const { fileName, data, fileType, expiresInSeconds } = params;
    try {
      await this.uploadFile({ fileName, data, fileType });

      return {
        signedUrl: await this.getSignedUrl(fileName, expiresInSeconds, false),
      };
    } catch (err) {
      logger.error(
        `Failed to upload file to Azure Blob Storage ${fileName}`,
        err,
      );
      handleStorageError(err, "upload file to Azure Blob Storage");
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
      handleStorageError(err, "upload JSON to Azure Blob Storage");
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
      handleStorageError(err, "download file from Azure Blob Storage");
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
      handleStorageError(err, "delete files from Azure Blob Storage");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    try {
      await this.createContainerIfNotExists();

      const result = this.client.listBlobsFlat({ prefix });
      const files = [];
      for await (const blob of result) {
        if (blob.name.startsWith(prefix)) {
          files.push({
            file: blob.name,
            createdAt: blob?.properties?.createdOn ?? new Date(),
          });
          if (files.length >= env.LANGFUSE_S3_LIST_MAX_KEYS) {
            break;
          }
        }
      }
      return files;
    } catch (err) {
      logger.error(
        `Failed to list files from Azure Blob Storage ${prefix}`,
        err,
      );
      handleStorageError(err, "list files from Azure Blob Storage");
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
      handleStorageError(err, "generate presigned URL for Azure Blob Storage");
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
      handleStorageError(
        err,
        "generate presigned upload URL for Azure Blob Storage",
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
      // Restore pre-v3.729 default so CompleteMultipartUpload doesn't send a
      // composite CRC32 header, which GCS's S3-compat layer rejects with 412.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
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
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
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
    return {
      ...params,
      ...buildS3SseParams({
        serverSideEncryption: this.awsSse,
        sseKmsKeyId: this.awsSseKmsKeyId,
      }),
    } as T;
  }

  public async uploadFile({
    fileName,
    fileType,
    data,
    partSize,
    queueSize,
  }: UploadFile): Promise<void> {
    try {
      await new Upload({
        client: this.client,
        params: this.addSSEToParams<PutObjectCommandInput>({
          Bucket: this.bucketName,
          Key: fileName,
          Body: data,
          ContentType: fileType,
        }),
        // Use provided partSize and queueSize, or fall back to defaults
        // Default: 5 MB part size supports files up to ~50 GB (5 MB × 10,000 parts)
        // For large files, use partSize: 100 * 1024 * 1024 (100 MB) to support up to ~1 TB
        partSize: partSize,
        queueSize: queueSize,
      }).done();

      return;
    } catch (err) {
      logger.error(`Failed to upload file to ${fileName}`, err);
      handleStorageError(err, "upload file to S3");
    }
  }

  public async uploadFileBuffered({
    fileName,
    fileType,
    data,
    partSizeBytes,
  }: UploadFileBuffered): Promise<void> {
    if (env.LANGFUSE_S3_UPLOAD_ENABLE_BUFFERED !== "true") {
      return this.uploadFile({ fileName, fileType, data });
    }

    const strategy = new S3ChunkedUploadStrategy({
      client: this.client,
      bucket: this.bucketName,
      key: fileName,
      contentType: fileType,
      sseConfig: {
        serverSideEncryption: this.awsSse,
        sseKmsKeyId: this.awsSseKmsKeyId,
      },
    });

    const uploader = new BufferedStreamUploader({
      strategy,
      partSizeBytes,
      maxPartAttempts: env.LANGFUSE_S3_UPLOAD_MAX_PART_ATTEMPTS,
      maxConcurrentParts: env.LANGFUSE_S3_UPLOAD_MAX_CONCURRENT_PARTS,
      key: fileName,
    });

    try {
      await uploader.upload(data);
    } catch (err) {
      logger.error(`Failed to upload file (buffered) to ${fileName}`, err);
      handleStorageError(err, "upload file to S3 (buffered)");
    }
  }

  public async uploadWithSignedUrl({
    fileName,
    fileType,
    data,
    expiresInSeconds,
    partSize,
    queueSize,
  }: UploadWithSignedUrl): Promise<{ signedUrl: string }> {
    try {
      await this.uploadFile({ fileName, data, fileType, partSize, queueSize });

      const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);

      return { signedUrl };
    } catch (err) {
      logger.error(`Failed to upload file to ${fileName}`, err);
      handleStorageError(err, "upload file to S3 or generate signed URL");
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
      handleStorageError(err, "upload JSON to S3");
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
      handleStorageError(err, "download file from S3");
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
      handleStorageError(err, "list files from S3");
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
      handleStorageError(err, "generate signed URL");
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
      handleStorageError(err, "delete files from S3");
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
  }: UploadFile): Promise<void> {
    try {
      const file = this.bucket.file(fileName);
      const options = {
        contentType: fileType,
        resumable: false,
      };

      if (typeof data === "string") {
        await file.save(data, options);
        return;
      } else if (data instanceof Readable) {
        return new Promise((resolve, reject) => {
          const writeStream = file.createWriteStream(options);

          data
            .pipe(writeStream)
            .on("error", (err: unknown) => {
              reject(err);
            })
            .on("finish", () => {
              resolve();
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
      handleStorageError(err, "upload file to Google Cloud Storage");
    }
  }

  public async uploadFileBuffered(params: UploadFileBuffered): Promise<void> {
    await this.uploadFile({
      fileName: params.fileName,
      fileType: params.fileType,
      data: params.data,
    });
  }

  public async uploadWithSignedUrl({
    fileName,
    fileType,
    data,
    expiresInSeconds,
  }: UploadWithSignedUrl): Promise<{ signedUrl: string }> {
    try {
      await this.uploadFile({ fileName, data, fileType });
      const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);
      return { signedUrl };
    } catch (err) {
      logger.error(
        `Failed to upload file to Google Cloud Storage ${fileName}`,
        err,
      );
      handleStorageError(err, "upload file to Google Cloud Storage");
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
      handleStorageError(err, "upload JSON to Google Cloud Storage");
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
      handleStorageError(err, "download file from Google Cloud Storage");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    try {
      const [files] = await this.bucket.getFiles({
        prefix,
        maxResults: env.LANGFUSE_S3_LIST_MAX_KEYS,
      });

      return files.map((file) => ({
        file: file.name,
        createdAt: new Date(file.metadata.timeCreated ?? new Date()),
      }));
    } catch (err) {
      logger.error(
        `Failed to list files from Google Cloud Storage ${prefix}`,
        err,
      );
      handleStorageError(err, "list files from Google Cloud Storage");
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
      handleStorageError(err, "generate signed URL for Google Cloud Storage");
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
      handleStorageError(
        err,
        "generate signed upload URL for Google Cloud Storage",
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
      handleStorageError(err, "delete files from Google Cloud Storage");
    }
  }
}

class OCIObjectStorageService implements StorageService {
  private client?: objectstorage.ObjectStorageClient;
  private clientInit: Promise<void>;
  private bucketName: string;
  private externalEndpoint?: string;
  private namespaceName: string = "";

  constructor(params: {
    bucketName: string;
    endpoint: string | undefined;
    externalEndpoint?: string | undefined;
    region: string | undefined;
  }) {
    this.bucketName = params.bucketName;
    this.externalEndpoint = params.externalEndpoint;
    this.clientInit = this.initClient(params);
  }

  private async initClient(params: { endpoint?: string; region?: string }) {
    let provider: common.AuthenticationDetailsProvider;
    switch (env.LANGFUSE_OCI_AUTH_TYPE) {
      case "workload_identity": {
        provider =
          new common.OkeWorkloadIdentityAuthenticationDetailsProvider.OkeWorkloadIdentityAuthenticationDetailsProviderBuilder().build();

        break;
      }

      case "instance_principal": {
        provider =
          await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();

        break;
      }

      case "resource_principal": {
        provider =
          common.ResourcePrincipalAuthenticationDetailsProvider.builder();

        break;
      }

      case "oci_profile": {
        provider = new common.ConfigFileAuthenticationDetailsProvider(
          env.LANGFUSE_OCI_CONFIG_FILE,
          env.LANGFUSE_OCI_CONFIG_PROFILE,
        );

        break;
      }

      case "session_token": {
        provider = new common.SessionAuthDetailProvider(
          env.LANGFUSE_OCI_CONFIG_FILE,
          env.LANGFUSE_OCI_CONFIG_PROFILE,
        );

        break;
      }

      default:
        throw new Error(
          "OCI auth not configured: set LANGFUSE_OCI_AUTH_TYPE to " +
            "'workload_identity' | 'instance_principal' | 'resource_principal' | 'oci_profile' | 'session_token'",
        );
    }

    this.client = new objectstorage.ObjectStorageClient({
      authenticationDetailsProvider: provider,
    });

    const regionId = params.region?.trim();
    if (regionId) this.client.region = common.Region.fromRegionId(regionId);
    const endpoint = params.endpoint?.trim();
    if (endpoint) this.client.endpoint = endpoint;
  }

  private async ensureClient() {
    await this.clientInit;
    if (!this.client)
      throw new Error("OCI ObjectStorage client failed to initialize");
    return this.client;
  }

  private async ensureNamespace(): Promise<string> {
    if (this.namespaceName) return this.namespaceName;
    const client = await this.ensureClient();
    const nsResp = await client.getNamespace({});
    this.namespaceName = nsResp.value ?? "";
    return this.namespaceName;
  }

  private async getClientAndNamespace(): Promise<{
    client: objectstorage.ObjectStorageClient;
    namespaceName: string;
  }> {
    const client = await this.ensureClient();
    const namespaceName = await this.ensureNamespace(); // uses the same client init + cached namespace
    return { client, namespaceName };
  }

  private async streamToString(
    readable: any, // could be many shapes, so use `any`
  ): Promise<string> {
    if (!readable) return "";

    // Helper: convert many chunk shapes to Buffer
    const toBuffer = (chunk: any): Buffer => {
      if (Buffer.isBuffer(chunk)) return chunk;
      if (typeof chunk === "string") return Buffer.from(chunk, "utf8");
      if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);
      // TypedArray / DataView
      if (ArrayBuffer.isView(chunk)) {
        return Buffer.from(
          (chunk as Uint8Array).buffer,
          (chunk as any).byteOffset ?? 0,
          (chunk as any).byteLength ?? undefined,
        );
      }
      // Fallback: try Buffer.from (may throw)
      return Buffer.from(chunk);
    };

    // 1) Node.js Readable (EventEmitter style)
    if (
      typeof readable.on === "function" &&
      typeof readable.read !== "undefined"
    ) {
      return await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        readable.on("data", (chunk: any) => {
          try {
            chunks.push(toBuffer(chunk));
          } catch (_err) {
            // if conversion fails, push as Buffer of stringified chunk
            chunks.push(Buffer.from(String(chunk)));
          }
        });
        readable.on("error", (err: any) => reject(err));
        readable.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      });
    }

    // 2) WHATWG ReadableStream (browser / some fetch-like APIs)
    if (typeof readable.getReader === "function") {
      const reader = readable.getReader();
      const chunks: Buffer[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(toBuffer(value));
        }
        return Buffer.concat(chunks).toString("utf8");
      } finally {
        // safe to close reader if available
        try {
          if (reader.releaseLock) reader.releaseLock();
        } catch (_err) {
          // intentionally ignore releaseLock errors
        }
      }
    }

    // 3) Buffer / Uint8Array / ArrayBuffer direct
    if (Buffer.isBuffer(readable)) return readable.toString("utf8");
    if (readable instanceof Uint8Array)
      return Buffer.from(readable).toString("utf8");
    if (readable instanceof ArrayBuffer)
      return Buffer.from(readable).toString("utf8");

    // 4) Blob (browser)
    if (typeof Blob !== "undefined" && readable instanceof Blob) {
      const ab = await readable.arrayBuffer();
      return Buffer.from(ab).toString("utf8");
    }

    // 5) Async iterable (some stream implementations)
    if (typeof readable[Symbol.asyncIterator] === "function") {
      const chunks: Buffer[] = [];
      for await (const chunk of readable) {
        chunks.push(toBuffer(chunk));
      }
      return Buffer.concat(chunks).toString("utf8");
    }

    // 6) Synchronous iterable
    if (typeof readable[Symbol.iterator] === "function") {
      const chunks: Buffer[] = [];
      for (const chunk of readable) {
        chunks.push(toBuffer(chunk));
      }
      return Buffer.concat(chunks).toString("utf8");
    }

    // 7) Fallback: try string conversion
    try {
      return String(readable);
    } catch (_err) {
      // If all else fails, throw a helpful error
      throw new TypeError("Unsupported body type passed to streamToString");
    }
  }
  public async uploadFile({
    fileName,
    fileType,
    data,
    partSize,
    queueSize,
  }: UploadFile): Promise<void> {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const uploadManager = new OciUploadManager(client, {
        partSize: partSize ?? 20 * 1024 * 1024,
        maxConcurrentUploads: queueSize ?? 5,
      });

      // UploadManager in the OCI SDK expects content shaped as one of:
      // { blob }, { filePath }, or { stream }.
      // To work reliably in Node, always provide { stream }.
      const stream =
        typeof data === "string"
          ? Readable.from([data])
          : data instanceof Readable
            ? data
            : Buffer.isBuffer(data as any)
              ? Readable.from([data as any])
              : Readable.from([String(data)]);

      const contentLength =
        typeof data === "string"
          ? Buffer.byteLength(data)
          : Buffer.isBuffer(data as any)
            ? (data as any).byteLength
            : undefined;

      await uploadManager.upload({
        requestDetails: {
          namespaceName,
          bucketName: this.bucketName,
          objectName: fileName,
          contentType: fileType,
          ...(contentLength ? { contentLength } : {}),
        },
        content: { stream },
      });

      return;
    } catch (err) {
      logger.error(
        `Failed to upload file to OCI Object Storage  ${fileName}`,
        err,
      );
      handleStorageError(err, "upload file to OCI Object Storage ");
    }
  }

  public async uploadFileBuffered({
    fileName,
    fileType,
    data,
    partSizeBytes,
  }: UploadFileBuffered): Promise<void> {
    await this.uploadFile({
      fileName,
      fileType,
      data,
      partSize: partSizeBytes,
    });
  }

  public async uploadWithSignedUrl({
    fileName,
    fileType,
    data,
    expiresInSeconds,
    partSize,
    queueSize,
  }: UploadWithSignedUrl): Promise<{ signedUrl: string }> {
    try {
      await this.uploadFile({ fileName, data, fileType, partSize, queueSize });

      const signedUrl = await this.getSignedUrl(fileName, expiresInSeconds);

      return { signedUrl };
    } catch (err) {
      logger.error(
        `Failed to upload file to OCI Object Storage  ${fileName}`,
        err,
      );
      handleStorageError(
        err,
        "upload file to OCI Object Storage  or generate signed URL",
      );
    }
  }

  public async uploadJson(path: string, body: Record<string, unknown>[]) {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const jsonString = JSON.stringify(body);
      const req: objectstorage.requests.PutObjectRequest = {
        namespaceName,
        bucketName: this.bucketName,
        objectName: path,
        contentLength: Buffer.byteLength(jsonString),
        putObjectBody: Readable.from([jsonString]),
        contentType: "application/json",
      };
      await client.putObject(req);
    } catch (err) {
      logger.error(`Failed to upload JSON to OCI Object Storage ${path}`, err);
      handleStorageError(err, "upload JSON to OCI Object Storage ");
    }
  }

  public async download(path: string): Promise<string> {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const req: objectstorage.requests.GetObjectRequest = {
        namespaceName,
        bucketName: this.bucketName,
        objectName: path,
      };
      const response = await client.getObject(req);
      const bodyStream = (response as any).value as
        | NodeJS.ReadableStream
        | undefined;
      return await this.streamToString(bodyStream);
    } catch (err) {
      logger.error(
        `Failed to download file from OCI Object Storage  ${path}`,
        err,
      );
      handleStorageError(err, "download file from OCI Object Storage ");
    }
  }

  public async listFiles(
    prefix: string,
  ): Promise<{ file: string; createdAt: Date }[]> {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const req: objectstorage.requests.ListObjectsRequest = {
        namespaceName,
        bucketName: this.bucketName,
        prefix,
      };
      const resp = await client.listObjects(req);
      const objects = ((resp as any).listObjects?.objects ?? []) as Array<{
        name?: string;
        timeCreated?: Date | string;
      }>;
      return (
        objects.flatMap((obj) =>
          obj.name
            ? [
                {
                  file: obj.name,
                  createdAt: obj.timeCreated
                    ? new Date(obj.timeCreated as any)
                    : new Date(),
                },
              ]
            : [],
        ) ?? []
      );
    } catch (err) {
      logger.error(
        `Failed to list files from OCI Object Storage  ${prefix}`,
        err,
      );
      handleStorageError(err, "list files from OCI Object Storage ");
    }
  }

  public async getSignedUrl(
    fileName: string,
    ttlSeconds: number,
    asAttachment: boolean = true,
  ): Promise<string> {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
      const req: objectstorage.requests.CreatePreauthenticatedRequestRequest = {
        namespaceName,
        bucketName: this.bucketName,
        createPreauthenticatedRequestDetails: {
          name: `read-${fileName}-${Date.now()}`,
          accessType: "ObjectRead" as any,
          objectName: fileName,
          timeExpires: expiresOn as any,
        } as any,
      };
      const resp = await client.createPreauthenticatedRequest(req);
      const accessUri = (resp.preauthenticatedRequest as any)
        .accessUri as string;
      const base = this.externalEndpoint ?? client.endpoint;

      if (!base) {
        throw new Error(
          "Cannot build PAR URL: no externalEndpoint configured and client.endpoint is empty",
        );
      }
      const baseUrl = new URL(base);
      const parUrl = new URL(accessUri, baseUrl);
      if (asAttachment) {
        parUrl.searchParams.set("download", "1");
      }
      const url = parUrl.toString();
      return url;
    } catch (err) {
      logger.error(
        `Failed to generate presigned URL (PAR) for OCI Object Storage  ${fileName}`,
        err,
      );
      handleStorageError(err, "generate signed URL for OCI Object Storage ");
    }
  }

  public async deleteFiles(paths: string[]): Promise<void> {
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      for (const p of paths) {
        const req: objectstorage.requests.DeleteObjectRequest = {
          namespaceName,
          bucketName: this.bucketName,
          objectName: p,
        } as any;
        await client.deleteObject(req as any);
      }
    } catch (err) {
      logger.error(`Failed to delete files from OCI Object Storage `, {
        error: err,
        files: paths,
      });
      handleStorageError(err, "delete files from OCI Object Storage ");
    }
  }

  public async getSignedUploadUrl(params: {
    path: string;
    ttlSeconds: number;
    sha256Hash: string;
    contentType: string;
    contentLength: number;
  }): Promise<string> {
    const { path, ttlSeconds } = params;
    try {
      const { client, namespaceName } = await this.getClientAndNamespace();
      const expiresOn = new Date(Date.now() + ttlSeconds * 1000);
      const req: objectstorage.requests.CreatePreauthenticatedRequestRequest = {
        namespaceName,
        bucketName: this.bucketName,
        createPreauthenticatedRequestDetails: {
          name: `write-${path}-${Date.now()}`,
          accessType: "ObjectWrite" as any,
          objectName: path,
          timeExpires: expiresOn as any,
        } as any,
      };
      const resp = await client.createPreauthenticatedRequest(req);
      const accessUri = (resp.preauthenticatedRequest as any)
        .accessUri as string;
      const base = this.externalEndpoint ?? client.endpoint;

      if (!base) {
        throw new Error(
          "Cannot build PAR URL: no externalEndpoint configured and client.endpoint is empty",
        );
      }
      const baseUrl = new URL(base);
      let url = new URL(accessUri, baseUrl).toString();
      return url;
    } catch (err) {
      logger.error(
        `Failed to generate presigned upload URL (PAR) for OCI Object Storage  ${path}`,
        err,
      );
      handleStorageError(
        err,
        "generate presigned upload URL for OCI Object Storage ",
      );
    }
  }
}
