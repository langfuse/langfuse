// Simple in-memory storage with expiry
export class TempFileStorage {
  private static files = new Map<
    string,
    {
      content: File;
      expiry: number;
    }
  >();

  private static EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private static MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 MB
  private static currentSize = 0;
  private static cleanupInterval: NodeJS.Timeout | null = null;

  static initialize() {
    // Start periodic cleanup
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 600_000); // Run every 10 minutes
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

  static store(file: File): string | null {
    const fileSize = file.size;
    if (this.currentSize + fileSize > this.MAX_TOTAL_SIZE) {
      throw new Error("Memory limit exceeded");
    }

    const id = crypto.randomUUID();
    this.files.set(id, {
      content: file,
      expiry: Date.now() + this.EXPIRY_MS,
    });
    this.currentSize += fileSize;
    return id;
  }

  static cleanup() {
    const now = Date.now();
    for (const [id, file] of this.files.entries()) {
      if (now > file.expiry) {
        this.currentSize -= file.content.size;
        this.files.delete(id);
      }
    }
  }

  static get(id: string): File | undefined {
    const file = this.files.get(id);
    if (!file) return undefined;

    if (Date.now() > file.expiry) {
      this.files.delete(id);
      return undefined;
    }

    return file.content;
  }
}
