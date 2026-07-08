import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { logger } from "../logger";
import type {
  ChunkedUploadStrategy,
  CompletedPart,
} from "./BufferedStreamUploader";
import { type S3SseConfig, buildS3SseParams } from "./StorageService";

export interface S3ChunkedUploadStrategyParams {
  client: S3Client;
  bucket: string;
  key: string;
  contentType: string;
  sseConfig?: S3SseConfig;
}

export class S3ChunkedUploadStrategy implements ChunkedUploadStrategy {
  private readonly params: S3ChunkedUploadStrategyParams;
  private uploadId: string | undefined;

  constructor(params: S3ChunkedUploadStrategyParams) {
    this.params = params;
  }

  async initialize(): Promise<void> {
    const response = await this.params.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.params.bucket,
        Key: this.params.key,
        ContentType: this.params.contentType,
        ...this.buildSseParams(),
      }),
    );
    this.uploadId = response.UploadId;
    if (!this.uploadId) {
      throw new Error(
        "Failed to initiate multipart upload: no UploadId returned",
      );
    }
  }

  async uploadPart(data: Buffer, partNumber: number): Promise<CompletedPart> {
    const response = await this.params.client.send(
      new UploadPartCommand({
        Bucket: this.params.bucket,
        Key: this.params.key,
        UploadId: this.uploadId,
        PartNumber: partNumber,
        Body: data,
        ContentLength: data.byteLength,
      }),
    );

    if (!response.ETag) {
      throw new Error(
        `S3 UploadPart for part ${partNumber} returned no ETag (key: ${this.params.key})`,
      );
    }

    return {
      partIdentifier: response.ETag,
      partNumber,
    };
  }

  async complete(parts: CompletedPart[]): Promise<void> {
    await this.params.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.params.bucket,
        Key: this.params.key,
        UploadId: this.uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            ETag: p.partIdentifier,
            PartNumber: p.partNumber,
          })),
        },
      }),
    );

    logger.info(
      `Completed multipart upload for ${this.params.key} (${parts.length} parts)`,
    );
  }

  async abort(reason?: string): Promise<void> {
    if (!this.uploadId) return;

    try {
      await this.params.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.params.bucket,
          Key: this.params.key,
          UploadId: this.uploadId,
        }),
      );
      logger.info(
        `Aborted multipart upload ${this.uploadId} for ${this.params.key}${reason ? `: ${reason}` : ""}`,
      );
    } catch (abortError) {
      logger.error(
        `Failed to abort multipart upload ${this.uploadId} for ${this.params.key}`,
        abortError instanceof Error
          ? abortError
          : new Error(String(abortError)),
      );
    }
  }

  async uploadSingleObject(data: Buffer): Promise<void> {
    await this.params.client.send(
      new PutObjectCommand({
        Bucket: this.params.bucket,
        Key: this.params.key,
        Body: data,
        ContentType: this.params.contentType,
        ...this.buildSseParams(),
      }),
    );
  }

  private buildSseParams(): Record<string, string> {
    return buildS3SseParams(this.params.sseConfig);
  }
}
