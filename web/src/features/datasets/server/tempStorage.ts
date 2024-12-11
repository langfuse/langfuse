import { randomUUID } from "crypto";
import { type Readable } from "stream";

export type StoredFile = {
  content: Buffer;
  filename: string;
  mimetype: string;
  expiry: number;
  projectId: string;
};

export class TempFileStorage {
  private static files = new Map<string, StoredFile>();

  private static EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
  private static MAX_TOTAL_SIZE = 1024 * 1024 * 1024 * 2; // 2 GB
  private static currentSize = 0;
  private static cleanupInterval: NodeJS.Timeout | null = null;

  static initialize() {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 1_200_000); // 20 minutes
    }
  }

  static destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.files.clear();
    this.currentSize = 0;
  }

  static async store(
    fileData: Buffer | Readable,
    filename: string,
    mimetype: string,
    projectId: string,
  ): Promise<string> {
    const content = Buffer.isBuffer(fileData)
      ? fileData
      : await this.streamToBuffer(fileData);

    const fileSize = content.length;
    if (this.currentSize + fileSize > this.MAX_TOTAL_SIZE) {
      throw new Error("Memory limit exceeded");
    }

    const id = randomUUID();
    this.files.set(id, {
      content,
      filename,
      mimetype,
      expiry: Date.now() + this.EXPIRY_MS,
      projectId,
    });
    this.currentSize += fileSize;
    return id;
  }

  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private static cleanup() {
    const now = Date.now();
    for (const [id, file] of this.files.entries()) {
      if (now > file.expiry) {
        this.currentSize -= file.content.length;
        this.files.delete(id);
      }
    }
  }

  static cleanupByProjectId(projectId: string) {
    for (const [id, file] of this.files.entries()) {
      if (file.projectId === projectId) {
        this.files.delete(id);
      }
    }
  }

  static get(id: string, projectId: string): StoredFile | undefined {
    const file = this.files.get(id);
    if (!file || file.projectId !== projectId) return undefined;

    if (Date.now() > file.expiry) {
      this.currentSize -= file.content.length;
      this.files.delete(id);
      return undefined;
    }

    return file;
  }
}
