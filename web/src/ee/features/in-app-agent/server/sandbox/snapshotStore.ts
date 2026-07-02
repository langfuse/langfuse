import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type SandboxSnapshotStore = {
  deleteSnapshot: (key: string) => Promise<void>;
  getSnapshot: (key: string) => Promise<Uint8Array | null>;
  putSnapshot: (key: string, snapshot: Uint8Array) => Promise<void>;
};

export function createLocalSandboxSnapshotStore(params?: {
  baseDir?: string;
}): SandboxSnapshotStore {
  const baseDir = params?.baseDir ?? path.join(os.tmpdir(), "langfuse-sandboxes");

  const getPath = (key: string) => path.join(baseDir, key);

  return {
    deleteSnapshot: async (key) => {
      await rm(getPath(key), { force: true }).catch(() => undefined);
    },
    getSnapshot: async (key) => {
      try {
        return await readFile(getPath(key));
      } catch {
        return null;
      }
    },
    putSnapshot: async (key, snapshot) => {
      const filePath = getPath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, snapshot);
    },
  };
}

export function createS3SandboxSnapshotStore(params: {
  accessKeyId?: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  region?: string;
  secretAccessKey?: string;
}): SandboxSnapshotStore {
  const client = new S3Client({
    ...(params.region ? { region: params.region } : {}),
    ...(params.endpoint ? { endpoint: params.endpoint } : {}),
    ...(params.forcePathStyle ? { forcePathStyle: true } : {}),
    ...(params.accessKeyId && params.secretAccessKey
      ? {
          credentials: {
            accessKeyId: params.accessKeyId,
            secretAccessKey: params.secretAccessKey,
          },
        }
      : {}),
  });
  const prefix = params.prefix?.replace(/\/+$/u, "") ?? "";
  const toObjectKey = (key: string) => (prefix ? `${prefix}/${key}` : key);

  return {
    deleteSnapshot: async (key) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: params.bucket,
          Key: toObjectKey(key),
        }),
      );
    },
    getSnapshot: async (key) => {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: params.bucket,
            Key: toObjectKey(key),
          }),
        );

        if (!response.Body) {
          return null;
        }

        return await response.Body.transformToByteArray();
      } catch (error) {
        if (error instanceof NoSuchKey) {
          return null;
        }

        if (
          error instanceof Error &&
          (error.name === "NoSuchKey" || error.name === "NotFound")
        ) {
          return null;
        }

        throw error;
      }
    },
    putSnapshot: async (key, snapshot) => {
      await client.send(
        new PutObjectCommand({
          Bucket: params.bucket,
          Key: toObjectKey(key),
          Body: snapshot,
          ContentType: "application/x-tar",
        }),
      );
    },
  };
}
